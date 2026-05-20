import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createAgent } from 'langchain';

const MAX_ROUNDS = 3;

const PlanSchema = z.object({
  needMoreRetrieval: z
    .boolean()
    .describe('是否需要更多检索才能充分回答当前子问题'),
  nextSearchQuery: z
    .string()
    .describe(
      '如果需要更多检索，给出精炼后的搜索查询词（关键词、术语、简短短语均可，' +
        '长度不超过50字）；如果不需要则为空字符串。',
    ),
  reason: z.string().describe('判断理由，简短说明'),
});

export async function planRetrievalNode(
  state: any,
  tools: { chatModel: ChatOpenAI },
) {
  const subQuestions: string[] = state.subQuestions ?? [];
  const currentSubIdx: number = state.currentSubIdx ?? 0;
  const subQuestion = subQuestions[currentSubIdx] ?? '';
  const retrievalRounds: number = state.retrievalRounds ?? 0;
  const allRetrievedDocs: any[] = state.allRetrievedDocs ?? [];
  const lastSearchQuery: string = state.searchQuery ?? '';
  const isResumeMode = state.inviteCodeValidated === true;

  console.log(
    `[检索规划] 进入 | 子问题[${currentSubIdx + 1}/${subQuestions.length}] R${retrievalRounds} | docs=${allRetrievedDocs.length}条 | resumeMode=${isResumeMode}`,
  );

  if (!subQuestion) {
    console.log('[检索规划] 返回: 无子问题');
    return {
      needMoreRetrieval: false,
      nextSearchQuery: '',
      planReason: '无子问题',
    };
  }

  if (retrievalRounds >= MAX_ROUNDS) {
    console.log(
      `[检索规划][${currentSubIdx + 1}/${subQuestions.length}] 已达最大轮次 ${MAX_ROUNDS}，携现有${allRetrievedDocs.length}条文档进入回答`,
    );
    return {
      needMoreRetrieval: false,
      nextSearchQuery: '',
      planReason: '已达最大检索轮次',
    };
  }

  if (allRetrievedDocs.length === 0) {
    if (isResumeMode && retrievalRounds < MAX_ROUNDS) {
      console.log(
        `[检索规划][${currentSubIdx + 1}/${subQuestions.length}] 无检索结果（简历模式），尝试换用关键词检索`,
      );
      return {
        needMoreRetrieval: true,
        nextSearchQuery: subQuestion.replace(/[？?。.，,、！!]/g, ' ').trim(),
        searchQuery: subQuestion.replace(/[？?。.，,、！!]/g, ' ').trim(),
        planReason: '未命中结果，尝试精简查询词重新检索',
      };
    }
    console.log(
      `[检索规划][${currentSubIdx + 1}/${subQuestions.length}] 无检索结果，直接进入回答`,
    );
    return {
      needMoreRetrieval: false,
      nextSearchQuery: '',
      planReason: '无检索结果',
    };
  }

  const docSummary = allRetrievedDocs
    .slice(-5)
    .map(
      (d, i) =>
        `[片段${allRetrievedDocs.length - 5 + i + 1}] ${d.content?.slice(0, 200)}`,
    )
    .join('\n---\n');

  const searchHistory =
    retrievalRounds > 1 ? `\n已执行的检索查询：${lastSearchQuery}` : '';

  const resumeRules = isResumeMode
    ? `\n严格规则（候选人简历模式）：\n1. 必须是包含候选人具体信息（如姓名、技能、项目、经历、github项目等）的文档才算相关\n2. 仅包含通用技术知识而不含候选人个人信息的文档视为不相关，需要继续检索\n3. 宁可多查一轮，也不能在信息不充分时给出回答\n4. 如果检索到的文档不包含此子问题所需的候选人具体信息，务必返回needMoreRetrieval=true`
    : '';

  console.log(
    `[检索规划] 准备LLM调用 | prompt约${800 + docSummary.length + subQuestion.length}字符`,
  );

  let parsed: z.infer<typeof PlanSchema>;
  try {
    const agent = createAgent({
      model: tools.chatModel,
      responseFormat: PlanSchema,
      systemPrompt: `你是检索规划器。判断已检索的文档是否足以充分回答当前子问题。

当前子问题：${subQuestion}${searchHistory}${resumeRules}

已检索到的文档摘要（共 ${allRetrievedDocs.length} 条，展示最近 5 条）：
${docSummary}

判断规则：
1. 如果已检索文档已包含回答问题所需的核心信息，返回needMoreRetrieval=false
   【例外：列举型项目问题必须遍历全部项目，参见规则5】
2. 如果需要补充不同维度的信息（例如当前只查了概念定义，还缺实现细节或应用场景），返回needMoreRetrieval=true
3. 如果当前检索完全不相关，尝试换一组更精准的关键词重新检索，返回needMoreRetrieval=true
4. 【nextSearchQuery 生成规则 - 重要】nextSearchQuery 会直接用于向量语义检索，必须满足：
   a) 是自然语句或关键词组合，**禁止**包含 "site:"、"inurl:"、"filetype:" 等搜索引擎语法
   b) **禁止**包含"候选人"、"面试者"、"简历中"等上下文元描述词（向量库中没有这些词）
   c) 从已检索文档中提取已出现的**具体项目名称、技术栈、文件名**作为关键词
   d) 如果已发现项目A但怀疑还有项目B未被检索到，用项目B可能涉及的**技术关键词**或**功能描述**来查询（如"图片压缩"、"前端工具"、"后端服务"、"API"等）
   e) 不超过50字
5. 【项目列举完整性规则】仅当子问题要求罗列所有项目时触发（如"做过什么项目""有哪些项目经历""项目列表""都有什么项目"等）：
   a) 必须确认候选人的所有项目文档是否已被全部检索到，而非仅匹配到一两个就停止
   b) 从已检索文档中提取项目名称列表，判断是否存在明显的项目遗漏
   c) 如果已检索文档中项目数量明显偏少（如只有1-2个），需用不同角度的查询词继续检索（如按技术关键词、项目类型、时间等维度）
   d) 任何时候都不应仅凭部分项目信息就断定"够了"，除非已尝试至少2轮不同角度的检索
   e) 当所有项目均已检索到或已尝试多轮不同查询，才能返回needMoreRetrieval=false
   f) 【重要】如果问题是针对某一个具体项目做深入分析（如"分析xx项目"），本规则不适用，只需确认该项目的详细信息完整即可
严格限制：最多再检索 ${MAX_ROUNDS - retrievalRounds} 轮，请谨慎判断是否真的需要。`,
    });

    const response = await agent.invoke({ messages: [] });
    parsed = response.structuredResponse as z.infer<typeof PlanSchema>;
    console.log(
      '[检索规划] Agent调用完成 | needMore=' +
        parsed.needMoreRetrieval +
        ' | reason=' +
        parsed.reason,
    );
  } catch (err) {
    console.error('[检索规划] Agent调用失败:', err);
    parsed = {
      needMoreRetrieval: false,
      nextSearchQuery: '',
      reason: 'LLM调用异常，直接进入回答',
    };
  }

  if (parsed.needMoreRetrieval && isResumeMode) {
    const irrelevant =
      parsed.reason.includes('不相关') || parsed.reason.includes('无关');
    if (irrelevant) {
      console.log(
        `[检索规划][${currentSubIdx + 1}/${subQuestions.length}][R${retrievalRounds}] ` +
          `简历模式下检索结果与问题不相关，停止检索直接回答 | ${parsed.reason}`,
      );
      return {
        needMoreRetrieval: false,
        nextSearchQuery: '',
        planReason: parsed.reason,
        allRetrievedDocs: [],
        retrievalDocs: [],
      };
    }
  }

  if (!parsed.needMoreRetrieval) {
    console.log(
      `[检索规划][${currentSubIdx + 1}/${subQuestions.length}][R${retrievalRounds}] ` +
        `进入回答 | ${parsed.reason}`,
    );
    return {
      needMoreRetrieval: false,
      nextSearchQuery: '',
      planReason: parsed.reason,
    };
  }

  const refinedQuery = parsed.nextSearchQuery?.trim() || subQuestion;
  console.log(
    `[检索规划][${currentSubIdx + 1}/${subQuestions.length}][R${retrievalRounds}] ` +
      `需继续检索 | ${parsed.reason} | 新查询: "${refinedQuery}"`,
  );

  return {
    needMoreRetrieval: true,
    nextSearchQuery: refinedQuery,
    searchQuery: refinedQuery,
    planReason: parsed.reason,
  };
}
