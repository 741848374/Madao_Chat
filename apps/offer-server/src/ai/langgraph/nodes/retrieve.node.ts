import { ConsoleLogger } from '@nestjs/common';
import { MilvusService } from '../../../tool/milvus.service';

const TOP_K = 5;
const TOP_K_RESUME = 15;
const TOP_K_LISTING = 30;
const SIMILARITY_THRESHOLD = 0.3;
const SIMILARITY_THRESHOLD_RESUME = 0.15;
const MAX_CONTENT_LENGTH = 800;

function isProjectListingQuery(query: string): boolean {
  const patterns = [
    /项目/,
    /都有什么/,
    /做过什么/,
    /有哪些/,
    /所有/,
    /全部/,
    /列表/,
    /罗列/,
    /github.*项目/,
    /仓库/,
  ];
  return patterns.some((p) => p.test(query));
}

function hasGithubContext(text: string): boolean {
  const q = text.toLowerCase();
  const patterns = [/github/, /仓库/, /repo/, /项目/, /project/, /代码/];
  if (patterns.some((p) => p.test(q))) return true;
  const tokens = q.trim().split(/\s+/);
  if (tokens.length <= 3 && !/[?？。，,、]/.test(q)) {
    if (tokens.some((t) => /[a-z]/.test(t) && (/-/.test(t) || /_/.test(t))))
      return true;
  }
  return false;
}

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
  const listingMode =
    isResumeMode && isProjectListingQuery(subQuestions[currentSubIdx] ?? '');
  const githubMode =
    isResumeMode &&
    (hasGithubContext(subQuestions[currentSubIdx] ?? '') ||
      hasGithubContext(state.query ?? '') ||
      hasGithubContext(searchQuery));

  const topK = listingMode
    ? TOP_K_LISTING
    : isResumeMode
      ? TOP_K_RESUME
      : TOP_K;
  const threshold = isResumeMode
    ? SIMILARITY_THRESHOLD_RESUME
    : SIMILARITY_THRESHOLD;

  console.log(
    `[向量检索] 进入 | 子问题[${currentSubIdx + 1}/${totalSubs}] R${retrievalRounds} | query="${searchQuery.slice(0, 50)}" | topK=${topK} | threshold=${threshold} | resumeMode=${isResumeMode} | githubMode=${githubMode} | listingMode=${listingMode} | 已有${allRetrievedDocs.length}条`,
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

  let filterExpr: string | undefined;
  if (isResumeMode && inviteeUserId) {
    filterExpr = `userId in ["${inviteeUserId}"]`;
  }

  try {
    const docsWithScores =
      await tools.milvusService.milvus.similaritySearchWithScore(
        searchQuery,
        topK,
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
      .filter((doc) => listingMode || doc.score >= threshold)
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
