import { ConsoleLogger } from '@nestjs/common';
import { MilvusService } from '../../../tool/milvus.service';

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;
const MAX_CONTENT_LENGTH = 800;

export async function retrieveNode(
  state: any,
  tools: { milvusService: MilvusService },
) {
  const subQuestions: string[] = state.subQuestions ?? [];
  const currentSubIdx: number = state.currentSubIdx ?? 0;
  const searchQuery: string =
    state.searchQuery ?? subQuestions[currentSubIdx]?.trim() ?? '';
  const retrievalRounds: number = (state.retrievalRounds ?? 0) + 1;
  const totalSubs = subQuestions.length;
  const allRetrievedDocs: any[] = state.allRetrievedDocs ?? [];

  const isResumeMode = state.inviteCodeValidated === true;

  console.log(
    `[向量检索] 进入 | 子问题[${currentSubIdx + 1}/${totalSubs}] R${retrievalRounds} | query="${searchQuery.slice(0, 50)}" | resumeMode=${isResumeMode} | 已有${allRetrievedDocs.length}条`,
  );

  if (!searchQuery) {
    console.log('[向量检索] 返回: searchQuery为空，跳过');
    return {
      retrievalDocs: [],
      allRetrievedDocs: [],
      searchQuery: '',
      retrievalRounds,
    };
  }

  const effectiveMaxLength = isResumeMode ? Infinity : MAX_CONTENT_LENGTH;
  const inviteeUserId = isResumeMode
    ? String(state.inviteeUserInfo?.id ?? '')
    : '';
  const filterExpr =
    isResumeMode && inviteeUserId
      ? `userId in ["${inviteeUserId}"]`
      : undefined;

  try {
    const docsWithScores =
      await tools.milvusService.milvus.similaritySearchWithScore(
        searchQuery,
        TOP_K,
        filterExpr,
      );

    const existingIds = new Set(
      allRetrievedDocs.map((d) => d.id ?? d.content?.slice(0, 40)),
    );

    const newDocs = docsWithScores
      .map(([doc, score]: any) => {
        const id = doc.metadata?.id ?? doc.pageContent?.slice(0, 40);
        return {
          content: doc.pageContent,
          score,
          id,
        };
      })
      .filter((doc) => !existingIds.has(doc.id))
      .filter((doc) => doc.score >= SIMILARITY_THRESHOLD)
      .map((doc) => {
        if (doc.content.length > effectiveMaxLength) {
          doc.content = doc.content.slice(0, effectiveMaxLength) + '...';
        }
        return doc;
      });

    const accumulated = [...allRetrievedDocs, ...newDocs];

    console.log(
      `[向量检索] 返回: 本轮新${newDocs.length}条 | 累计${accumulated.length}条 | filter=${filterExpr || '(无)'}`,
    );

    return {
      retrievalDocs: newDocs,
      allRetrievedDocs: accumulated,
      retrievalRounds,
    };
  } catch (error) {
    console.error('向量检索失败:', error);
    return {
      retrievalDocs: [],
      allRetrievedDocs,
      retrievalRounds,
    };
  }
}
