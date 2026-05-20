import { ChatOpenAI } from '@langchain/openai';
import { Tool } from '@langchain/core/tools';
import { Logger } from '@nestjs/common';
import { createAgent } from 'langchain';

interface WebSearchPage {
  title: string;
  url: string;
  summary: string;
  siteName: string;
  siteIcon: string;
  dateLastCrawled: string;
}

interface WebSearchResults {
  query: string;
  results: WebSearchPage[];
}

function parseWebSearchResult(raw: string, query: string): WebSearchResults {
  const results: WebSearchPage[] = [];
  const blocks = raw.split(/\n(?=引用: \d+)/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const title = /^标题:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';
    const url = /^URL:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';
    const summary = /^摘要:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';
    const siteName = /^网站名称:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';
    const siteIcon = /^网站图标:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';
    const dateLastCrawled = /^发布时间:\s*(.+)$/m.exec(trimmed)?.[1] ?? '';

    if (title || url) {
      results.push({
        title,
        url,
        summary,
        siteName,
        siteIcon,
        dateLastCrawled,
      });
    }
  }

  return { query, results };
}

function buildSystemPrompt(
  subQuestion: string,
  context: string,
  isResumeMode: boolean,
): string {
  if (isResumeMode) {
    if (context) {
      return `你是一个专业的技术面试助手。以下是关于候选人的参考资料，请基于参考资料回答用户问题。
如果参考资料不足以回答，可以调用 web_search 工具联网搜索补充信息。

参考资料：
${context}

规则：
1. 基于参考资料中的明确信息作答，不得编造
2. 资料中某方面信息缺失时，直接说明"未找到相关信息"，不猜测
3. 如果需要补充信息（如公司背景、行业动态等），使用 web_search 工具联网搜索
4. 回答完整充分但尽量精炼，不啰嗦
5. 不需要提及"根据参考资料"等字样，直接作答`;
    }
    return `你是一个专业的技术面试助手。简历中未检索到该候选人的相关信息。
请调用 web_search 工具联网搜索获取信息。

规则：
1. 如果问题是关于候选人个人经历、技能、项目等（如"他做过什么项目"、"他会哪些技术"），告知"未在简历中找到相关信息"
2. 如果需要了解外部信息（如公司背景、技术对比、行业动态等），使用 web_search 工具联网搜索
3. 如果问题是通用技术/知识类问题（如"什么是Node.js"、"解释一下微服务架构"），直接基于自身知识回答
4. 不得编造信息，回答精炼`;
  }

  if (context) {
    return `你是一个专业的技术面试助手。请根据以下参考资料回答用户问题。

参考资料：
${context}

规则：
1. 优先基于参考资料回答，确保信息准确
2. 回答完整充分但尽量精炼，不啰嗦
3. 如果参考资料不足以完全回答问题，可结合自身知识补充
4. 不需要提及"根据参考资料"等字样，直接作答`;
  }

  return `你是一个专业的技术面试助手。回答用户问题，完整充分但尽量精炼。`;
}

function extractWebSearchResults(
  messages: any[],
  query: string,
): WebSearchResults | null {
  const toolMsgs = messages.filter((m: any) => {
    const t = m._getType?.() ?? m.getType?.() ?? '';
    return t === 'tool' && m.name === 'web_search';
  });

  for (const msg of toolMsgs) {
    const raw: string = typeof msg.content === 'string' ? msg.content : '';
    if (
      !raw ||
      raw.startsWith('未找到相关结果') ||
      raw.startsWith('搜索 API 请求失败') ||
      raw.startsWith('Bocha Web Search')
    ) {
      continue;
    }
    const parsed = parseWebSearchResult(raw, query);
    if (parsed.results.length > 0) {
      return parsed;
    }
  }

  return null;
}

export async function answerNode(
  state: any,
  tools: { chatModel: ChatOpenAI; messageTool: Tool; webSearchTool: Tool },
) {
  const subQuestions: string[] = state.subQuestions ?? [];
  const currentSubIdx: number = state.currentSubIdx ?? 0;
  const totalCount = subQuestions.length;
  const subQuestion = subQuestions[currentSubIdx] ?? '';
  const allRetrievedDocs: any[] = state.allRetrievedDocs ?? [];
  const retrievalRounds: number = state.retrievalRounds ?? 0;
  const subAnswers: string[] = state.subAnswers ?? [];
  const isResumeMode = state.inviteCodeValidated === true;

  Logger.log(
    `[回答] 进入 | 子问题[${currentSubIdx + 1}/${totalCount}] R${retrievalRounds} | docs=${allRetrievedDocs.length}条 | resumeMode=${isResumeMode} | q="${subQuestion.slice(0, 50)}"`,
    'answerNode',
  );

  if (!subQuestion) {
    const nextIdx = currentSubIdx + 1;
    Logger.warn(
      `[回答] 分支: 无子问题 | 跳到第${nextIdx}个 → ${subQuestions[nextIdx] ? '继续' : '结束'}`,
      'answerNode',
    );
    return {
      currentSubIdx: nextIdx,
      allRetrievedDocs: [],
      retrievalDocs: [],
      retrievalRounds: 0,
      searchQuery: subQuestions[nextIdx] ?? '',
    };
  }

  let context = '';
  if (allRetrievedDocs.length > 0) {
    context = allRetrievedDocs
      .map(
        (doc, i) =>
          `[参考片段 ${i + 1}] score=${doc.score?.toFixed(4) ?? 'N/A'}\n${doc.content}`,
      )
      .join('\n\n');
  }

  const systemPrompt = buildSystemPrompt(subQuestion, context, isResumeMode);

  Logger.log(
    `[回答] 创建Agent | resumeMode=${isResumeMode} | hasContext=${!!context} | prompt约${systemPrompt.length}字符`,
    'answerNode',
  );

  const agent = createAgent({
    model: tools.chatModel,
    tools: [tools.webSearchTool],
    systemPrompt,
  });

  let answerText: string;
  let webSearchData: WebSearchResults | null = null;

  try {
    const response = await agent.invoke({
      messages: [{ role: 'user', content: subQuestion }],
    });

    const messages: any[] = response.messages ?? [];

    webSearchData = extractWebSearchResults(messages, subQuestion);

    const lastAIMessage = [...messages].reverse().find((m: any) => {
      const t = m._getType?.() ?? m.getType?.() ?? '';
      return t === 'ai';
    });

    answerText =
      lastAIMessage && typeof lastAIMessage.content === 'string'
        ? lastAIMessage.content
        : lastAIMessage
          ? JSON.stringify(lastAIMessage.content)
          : '';

    if (!answerText) {
      answerText = '抱歉，无法生成回答。';
    }

    Logger.log(
      `[回答] Agent完成 | answer=${answerText.length}字符 | webSearch=${webSearchData ? webSearchData.results.length + '条' : '无'} | llmCalls=${
        messages.filter((m: any) => {
          const t = m._getType?.() ?? m.getType?.() ?? '';
          return t === 'ai';
        }).length
      }次`,
      'answerNode',
    );
  } catch (err) {
    Logger.error(
      `[回答] Agent调用失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'answerNode',
    );
    answerText = `抱歉，生成回答时发生错误。`;
  }

  const fullAnswer = `**${subQuestion}**\n${answerText}`;

  const stream: any[] = [];

  const nextIdx = currentSubIdx + 1;
  const progress = `${nextIdx}/${totalCount}`;

  const answerMemoryEntry: any = {
    role: 'assistant',
    content: fullAnswer,
    type: 'message-answer',
    timestamp: Date.now(),
  };

  const chatMemory: any[] = [answerMemoryEntry];

  let retrievalInfo: string;
  if (allRetrievedDocs.length > 0) {
    retrievalInfo = `（已通过 ${retrievalRounds} 轮检索获取 ${allRetrievedDocs.length} 条参考资料）`;
  } else if (webSearchData?.results?.length) {
    retrievalInfo = `（知识库无充分资料，通过联网搜索获取 ${webSearchData.results.length} 条信息）`;
  } else {
    retrievalInfo = `（未检索到相关参考资料）`;
  }

  if (webSearchData && webSearchData.results.length > 0) {
    const webSearchMsg = await tools.messageTool.invoke({
      type: 'message-web-search',
      content: JSON.stringify({ ...webSearchData, subQuestion }),
    });
    stream.push(webSearchMsg);

    answerMemoryEntry.webSearch = { ...webSearchData, subQuestion };
  }

  const msgResult = await tools.messageTool.invoke({
    type: 'message-answer',
    content: fullAnswer,
  });
  stream.push(msgResult);

  Logger.log(
    `[回答][${progress}] 完成 | q="${subQuestion.slice(0, 40)}" | answer=${answerText.length}字符 ${retrievalInfo}`,
    'answerNode',
  );

  return {
    stream,
    subAnswers: [...subAnswers, answerText],
    currentSubIdx: nextIdx,
    allRetrievedDocs: [],
    retrievalDocs: [],
    retrievalRounds: 0,
    searchQuery: subQuestions[nextIdx] ?? '',
    generation: `answered-${progress}`,
    chatMemory,
  };
}
