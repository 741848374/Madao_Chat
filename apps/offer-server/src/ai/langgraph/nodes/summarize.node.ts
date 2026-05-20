import { ChatOpenAI } from '@langchain/openai';
import { Tool } from '@langchain/core/tools';
import { Logger } from '@nestjs/common';
import { createAgent } from 'langchain';

export async function summarizeNode(
  state: any,
  tools: { chatModel: ChatOpenAI; messageTool: Tool },
) {
  const subQuestions: string[] = state.subQuestions ?? [];
  const subAnswers: string[] = state.subAnswers ?? [];
  const mainTopic: string = state.mainTopic ?? '';

  Logger.log(
    `[总结] 进入 | 子问题数=${subQuestions.length} | 子回答数=${subAnswers.length} | topic=${mainTopic}`,
    'summarizeNode',
  );

  if (subQuestions.length === 0 || subAnswers.length === 0) {
    Logger.warn('[总结] 分支: 无子问题或子回答，跳过', 'summarizeNode');
    return {
      generation: 'summarized',
    };
  }

  const qaPairs = subQuestions
    .map((q: string, i: number) => {
      const a = subAnswers[i] ?? '';
      return `问题${i + 1}：${q}\n回答${i + 1}：${a}`;
    })
    .join('\n\n---\n\n');

  const topicHint = mainTopic ? `本次面试主题：${mainTopic}` : '';

  try {
    const agent = createAgent({
      model: tools.chatModel,
      systemPrompt: `你是候选人（面试者），面试官刚刚向你提出了多个问题。请基于已有的回答，以候选人的第一人称口吻总结一份简洁的回复呈现给面试官。

${topicHint}

规则：
1. 以"面试官您好，"或类似开场白开头，用候选人的第一人称（我）来表述
2. 用 2-4 句话概括本次面试涉及的核心主题和你（候选人）的回答要点
3. 简要列出每个问题的回答关键要点（每条不超过40字）
4. 如已有的回答中涉及具体技能、项目、经验等，在总结中以个人介绍的方式体现
5. 语言精炼，不超过 300 字
6. 直接输出总结内容，不要加任何标题

致命规则 —— 违反即为失败：
- 只能基于下面提供的问答内容来总结，严禁添加问答中不存在的信息
- 严禁编造、臆测、补充任何技能、项目、经验、数据、细节
- 如果问答中没有提到某个信息，绝不能在总结中出现
- 每条关键要点必须能在对应回答中找到原文依据`,
    });

    const queryContent = `以下是本次面试的全部问答：\n\n${qaPairs}`;
    const response = await agent.invoke({
      messages: [{ role: 'user', content: queryContent }],
    });

    const messages: any[] = response.messages ?? [];
    const lastAIMessage = [...messages].reverse().find((m: any) => {
      const t = m._getType?.() ?? m.getType?.() ?? '';
      return t === 'ai';
    });

    const summaryText =
      lastAIMessage && typeof lastAIMessage.content === 'string'
        ? lastAIMessage.content
        : '';

    if (!summaryText) {
      Logger.warn('[总结] LLM返回空内容', 'summarizeNode');
      return {
        generation: 'summarized',
      };
    }

    Logger.log(
      `[总结] 生成完成 | summary=${summaryText.length}字符`,
      'summarizeNode',
    );

    const msgResult = await tools.messageTool.invoke({
      type: 'message-summary',
      content: summaryText,
    });

    return {
      stream: [msgResult],
      generation: 'summarized',
      chatMemory: [
        {
          role: 'assistant',
          content: summaryText,
          type: 'message-summary',
          timestamp: Date.now(),
        },
      ],
    };
  } catch (err) {
    Logger.error(
      `[总结] LLM调用失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'summarizeNode',
    );
    return {
      generation: 'summarized',
    };
  }
}
