import { ChatOpenAI } from '@langchain/openai';
import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createAgent } from 'langchain';
import { Logger } from '@nestjs/common';

const NO_QUESTION_MSG = '请面试官提问问题';

const DecomposeSchema = z.object({
  hasValidQuestion: z
    .boolean()
    .describe(
      '用户是否提出了一个有效的面试问题。注意：不以标点符号（如？）为唯一判断标准，' +
        '陈述句、反问句、观点征询等形式的提问都应视为有效问题。' +
        '例如"栈是什么"、"你对前端的看法"、"请解释一下闭包"等都算有效问题。' +
        '个人规划、职业发展类问题也应视为有效（如"程序员如何规划职业发展"、"前端工程师应该学什么"）。',
    ),
  reason: z.string().describe('判断理由，简短说明'),
  subQuestions: z
    .array(z.string())
    .describe(
      '从用户一段query中拆解出的独立子问题列表。用户可能在一条消息中提出多个问题，' +
        '请将它们拆分为一个个单独的问题。每条子问题必须是可独立检索的完整中文问句，' +
        '语义完整清晰，不依赖上下文即可理解。如果用户只提了一个问题，则只包含该问题本身。' +
        '如果没有有效问题则为空数组。',
    ),
  mainTopic: z.string().describe('问题的主要技术主题'),
});

export async function decomposeNode(
  state: any,
  tools: { chatModel: ChatOpenAI; messageTool: Tool },
) {
  const query: string = state.query;

  Logger.log(
    `[问题拆解] 进入 | query="${(query ?? '').slice(0, 60)}" | validated=${state.inviteCodeValidated ?? false}`,
    'decomposeNode',
  );

  if (!query || query.trim() === '') {
    Logger.warn('[问题拆解] 分支: query为空 | 返回无问题提示', 'decomposeNode');
    const result = await tools.messageTool.invoke({
      type: 'message-no-question',
      content: NO_QUESTION_MSG,
    });
    return {
      stream: [result],
      generation: 'noQuestion',
      hasValidQuestion: false,
      chatMemory: [
        {
          role: 'user',
          content: query,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: NO_QUESTION_MSG,
          type: 'message-no-question',
          timestamp: Date.now(),
        },
      ],
    };
  }

  Logger.log('[问题拆解] 调用LLM分析问题', 'decomposeNode');

  let parsed: z.infer<typeof DecomposeSchema>;
  try {
    const agent = createAgent({
      model: tools.chatModel,
      responseFormat: DecomposeSchema,
      systemPrompt: `你是一个面试问题分析器。分析用户最后一条消息是否包含有效的面试问题。

核心判断标准：
- 用户消息中是否表达了想让AI回答某个计算机/技术/职业规划相关内容的意图，无论其语法形式如何。
- 任何以陈述句、疑问句、祈使句等形式提出的计算机技术或职业规划话题，都应判定为hasValidQuestion=true。
- 含有具体项目名称（如"项目X"、"xx仓库"、"xx项目"）或参考信息（如链接、描述、上下文）的消息，**所有附带信息都是该问题的组成部分，属于同一个问题**。

有效问题示例（这些都应判为有效）：
- "栈是什么"（陈述句式提问，无问号）
- "你对前端的看法"（观点征询，无问号）
- "请解释一下闭包"（祈使句形式）
- "HTTP和HTTPS的区别？"（疑问句形式）
- "讲一下Redis的持久化机制"（祈使句形式）
- "什么是微服务"（陈述句式）
- "程序员如何规划职业发展"（个人规划类）
- " [https://github.com/user/repo]  这个项目是做什么的"（带链接的项目问题，整个消息算一个问题）
- " [https://github.com/user/repo]  该项目的功能、技术架构和实现原理，详细分析"（带链接+多个分析维度，但属于同一个问题）

无效问题示例：
- "你好" / "在吗" / "谢谢"（纯打招呼或客套）
- "今天天气不错"（与技术和职业完全无关的闲聊）
- "帮我写一首诗"（与技术面试无关）

拆解规则（极其重要，严格遵守）：

【规则1：子问题数量守恒】subQuestions的数量必须**严格等于**用户消息中用标点或连词**明确分隔**的独立问题数量。不允许凭空增加。
- 用户提了1个问题 → subQuestions长度为1
- 用户提了2个问题 → subQuestions长度为2
- 用户提了0个问题 → subQuestions长度为0（空数组）

【规则2：信息不可单独拆解】项目中附带的描述、链接、技术主题等信息不能作为独立子问题被单独拆出。
- " [https://github.com/user/repo]  这是什么项目" → 1个子问题：整个消息作为一个完整问题
- " [repo链接]  该项目功能、架构和实现原理" → 1个子问题：功能、架构、原理是同一问题的分析维度，不拆分
- "分析reponame项目的技术方案" → 1个子问题

【规则3：子问题可适度增强检索质量】可以在保留原意的基础上将问题改写成更适合向量检索的形式。
- 允许：补充问句结构使之完整（如"栈"→"栈这种数据结构"）
- 允许：将口语化表达转为技术术语（如"那个存东西的东西"→"Redis缓存机制"）
- 允许：将隐含的检索意图显式化（如"这个项目是做什么的 [repo链接]" → "repo-name项目的功能和用途"）
- **禁止**：将一个问题拆成多个子问题
- **禁止**：凭空创造用户没问的新子问题
- **禁止**：删除或忽略用户消息中的关键信息（如项目名、链接、上下文描述）

【规则4：拆分条件】仅当明确分隔时才拆分：
- "什么是闭包？事件循环呢？" → 2个子问题：["什么是闭包","什么是事件循环"]
- "栈和队列的区别以及应用场景" → 1个子问题（连词连接，不可拆分）
- "什么是闭包？如何实现？有什么应用场景？" → 1个子问题（同一主题的连续追问，不可拆分）

【规则5：mainTopic提取】提取问题的主要技术主题（如"数据结构/栈与队列"、"JavaScript闭包"、"前端工程化"、"职业规划/AI转型"等）

用户消息：${query}`,
    });
    const response = await agent.invoke({ messages: [] });
    parsed = response.structuredResponse as z.infer<typeof DecomposeSchema>;
  } catch (err) {
    Logger.error(
      `[问题拆解] LLM调用失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'decomposeNode',
    );
    const msgResult = await tools.messageTool.invoke({
      type: 'message-no-question',
      content: NO_QUESTION_MSG,
    });
    return {
      stream: [msgResult],
      generation: 'noQuestion',
      hasValidQuestion: false,
      chatMemory: [
        {
          role: 'user',
          content: query,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: NO_QUESTION_MSG,
          type: 'message-no-question',
          timestamp: Date.now(),
        },
      ],
    };
  }

  Logger.log(
    `[问题拆解] LLM返回 | hasValid=${parsed.hasValidQuestion} | subCount=${parsed.subQuestions?.length ?? 0} | topic=${parsed.mainTopic}`,
    'decomposeNode',
  );

  if (!parsed.hasValidQuestion) {
    Logger.warn(
      `[问题拆解] 返回: 无有效问题 | reason=${parsed.reason}`,
      'decomposeNode',
    );
    const msgResult = await tools.messageTool.invoke({
      type: 'message-no-question',
      content: NO_QUESTION_MSG,
    });
    return {
      stream: [msgResult],
      generation: 'noQuestion',
      hasValidQuestion: false,
      chatMemory: [
        {
          role: 'user',
          content: query,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: NO_QUESTION_MSG,
          type: 'message-no-question',
          timestamp: Date.now(),
        },
      ],
    };
  }

  Logger.log(
    `[问题拆解] 返回: 拆解成功 | subQuestions=[${parsed.subQuestions.map((q) => `"${q.slice(0, 40)}"`).join(', ')}]`,
    'decomposeNode',
  );

  return {
    generation: 'decomposed',
    hasValidQuestion: true,
    subQuestions: parsed.subQuestions,
    mainTopic: parsed.mainTopic,
    decomposeReason: parsed.reason,
    currentSubIdx: 0,
    searchQuery: parsed.subQuestions[0] ?? '',
    chatMemory: [
      {
        role: 'user',
        content: query,
        timestamp: Date.now(),
      },
    ],
  };
}
