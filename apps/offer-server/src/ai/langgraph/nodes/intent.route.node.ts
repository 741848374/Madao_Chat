import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createAgent } from 'langchain';
import { Logger } from '@nestjs/common';
import { Tool } from '@langchain/core/tools';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { RedisService } from '../../../redis/redis.service';

const IntentSchema = z.object({
  intent: z
    .enum(['interviewer', 'interviewee', 'general', 'end_interview'])
    .describe(
      'interviewer: 面试官角色提问、技术知识问答、编程问题等。' +
        'interviewee: 用户想被面试、模拟面试。' +
        'general: 仅限纯闲聊问候，如"你好""在吗"。' +
        'end_interview: 用户明确表达结束或退出面试的意图，如"结束面试""退出""再见""拜拜""不面了""今天就到这里"等。',
    ),
  reason: z.string().describe('分类理由，简短说明'),
  inviteCode: z
    .string()
    .nullable()
    .describe(
      '如果用户消息中包含面试邀请码（通常是一串字母数字组合），提取出来。' +
        '如果上一轮助手询问了邀请码且用户本次回复可能是邀请码，也提取出来。' +
        '如果没有任何邀请码，返回null。',
    ),
});

export type IntentResult = z.infer<typeof IntentSchema>;

const REDIS_PREFIX = 'invite_code:';

export async function intentRouteNode(
  state: any,
  tools: {
    chatModel: ChatOpenAI;
    redisService: RedisService;
    messageTool: Tool;
  },
  config?: LangGraphRunnableConfig,
) {
  const username: string = state.username;
  const messages = state.messages;
  //const lastUserMessage = messages[messages.length - 1]?.content ?? '';

  Logger.log(
    `[意图路由] 进入 | username="${username || '(无)'}" | msg="${state.query.slice(0, 50)}"`,
    'intentRouteNode',
  );

  const redisKey = REDIS_PREFIX + username;
  Logger.log(
    `[意图路由|诊断] Redis GET前 | username="${username || '(无)'}" | redisKey="${redisKey}" | 是否查询=${!!username}`,
    'intentRouteNode',
  );

  let cached: string | null = null;
  if (username) {
    try {
      cached = await tools.redisService.get(redisKey);
      const keyTtl = await tools.redisService.ttl(redisKey);
      Logger.log(
        `[意图路由|诊断] Redis GET结果 | key="${redisKey}" | 结果=${cached ? '命中(有值)' : 'MISS(空)'} | 值长度=${cached?.length ?? 0} | TTL=${keyTtl}`,
        'intentRouteNode',
      );
    } catch (err) {
      Logger.error(
        `[意图路由|诊断] Redis GET异常 | key="${redisKey}" | err="${err}"`,
        err instanceof Error ? err.stack : undefined,
        'intentRouteNode',
      );
      cached = null;
    }
  }

  if (!cached && config?.configurable?.thread_id) {
    const threadKey = `invite_code_thread:${config.configurable.thread_id}`;
    try {
      cached = await tools.redisService.get(threadKey);
      Logger.log(
        `[意图路由|诊断] threadId回退查询 | key="${threadKey}" | 结果=${cached ? '命中(有值)' : 'MISS(空)'}`,
        'intentRouteNode',
      );
    } catch (err) {
      Logger.error(
        `[意图路由|诊断] threadId回退查询异常 | key="${threadKey}" | err="${err}"`,
        err instanceof Error ? err.stack : undefined,
        'intentRouteNode',
      );
    }
  }

  if (cached) {
    const { inviteCode, userInfo } = JSON.parse(cached);
    Logger.log(
      `[意图路由] Redis缓存命中 | inviteCode=${inviteCode} | user=${userInfo?.username}，调LLM检测结束意向`,
      'intentRouteNode',
    );

    let endResult: IntentResult;
    try {
      endResult = await classifyIntent(tools.chatModel, state.query);
    } catch (err) {
      Logger.error(
        `[意图路由] 缓存态LLM调用失败，降级为非结束意向: ${err}`,
        err instanceof Error ? err.stack : undefined,
        'intentRouteNode',
      );
      endResult = {
        intent: 'interviewer',
        reason: 'LLM异常，降级继续面试',
        inviteCode,
      };
    }

    Logger.log(
      `[意图路由] 缓存态LLM分类结果 | intent=${endResult.intent} | reason=${endResult.reason}`,
      'intentRouteNode',
    );

    if (endResult.intent === 'end_interview') {
      Logger.warn(
        `[意图路由|诊断] ⚠️ 缓存态LLM判定为end_interview，将触发clearSession清Redis | userMsg="${state.query.slice(0, 50)}" | reason="${endResult.reason}"`,
        'intentRouteNode',
      );
      Logger.log(
        '[意图路由] 返回: 检测到结束面试意向 | 路由到clearSession',
        'intentRouteNode',
      );

      const validatedMessage = await tools.messageTool.invoke({
        type: 'message-invite-code-validated',
        content: inviteCode,
      });

      return {
        intent: 'end_interview',
        intentReason: endResult.reason,
        inviteCode,
        inviteCodeValidated: true,
        inviteeUserInfo: userInfo,
        username,
        stream: [validatedMessage],
        chatMemory: [
          {
            role: 'assistant',
            content: inviteCode,
            type: 'message-invite-code-validated',
            timestamp: Date.now(),
          },
        ],
      };
    }

    Logger.log(
      '[意图路由] 返回: 非结束意向，使用缓存态继续面试',
      'intentRouteNode',
    );

    const validatedMessage = await tools.messageTool.invoke({
      type: 'message-invite-code-validated',
      content: inviteCode,
    });

    return {
      intent: 'interviewer',
      intentReason: '从Redis缓存中恢复已认证的邀请码',
      inviteCode,
      inviteCodeValidated: true,
      inviteeUserInfo: userInfo,
      username,
      stream: [validatedMessage],
      chatMemory: [
        {
          role: 'assistant',
          content: inviteCode,
          type: 'message-invite-code-validated',
          timestamp: Date.now(),
        },
      ],
    };
  }

  Logger.log(
    `[意图路由] 调用LLM分类 | msg="${state.query.slice(0, 50)}"`,
    'intentRouteNode',
  );
  Logger.log(
    `[意图路由|诊断] Redis MISS，走LLM提取邀请码路径 | username="${username || '(无)'}" | inviteCodeValidated=${state.inviteCodeValidated} | inviteCode="${state.inviteCode || '(无)'}"`,
    'intentRouteNode',
  );

  if (state.inviteCodeValidated && state.inviteeUserInfo) {
    Logger.log(
      `[意图路由|诊断] 🔄 降级: Redis MISS但checkpoint有inviteCodeValidated=true | inviteCode="${state.inviteCode}" | user=${state.inviteeUserInfo?.username}`,
      'intentRouteNode',
    );

    const syncUsername = state.inviteeUserInfo?.username || username;
    if (syncUsername) {
      try {
        await tools.redisService.set(
          REDIS_PREFIX + syncUsername,
          JSON.stringify({
            inviteCode: state.inviteCode,
            userInfo: state.inviteeUserInfo,
          }),
          3600,
        );
        Logger.log(
          `[意图路由|诊断] 🔄 重新同步Redis缓存 | key="${REDIS_PREFIX}${syncUsername}"`,
          'intentRouteNode',
        );
      } catch (err) {
        Logger.error(
          `[意图路由|诊断] 重新同步Redis失败: ${err}`,
          err instanceof Error ? err.stack : undefined,
          'intentRouteNode',
        );
      }
    }

    if (config?.configurable?.thread_id) {
      const threadKey = `invite_code_thread:${config.configurable.thread_id}`;
      try {
        await tools.redisService.set(
          threadKey,
          JSON.stringify({
            inviteCode: state.inviteCode,
            userInfo: state.inviteeUserInfo,
          }),
          3600,
        );
        Logger.log(
          `[意图路由|诊断] 🔄 重新同步threadId缓存 | key="${threadKey}"`,
          'intentRouteNode',
        );
      } catch (err) {
        Logger.error(
          `[意图路由|诊断] 重新同步threadId缓存失败: ${err}`,
          err instanceof Error ? err.stack : undefined,
          'intentRouteNode',
        );
      }
    }

    const validatedMessage = await tools.messageTool.invoke({
      type: 'message-invite-code-validated',
      content: state.inviteCode,
    });

    return {
      intent: 'interviewer',
      intentReason: '从Checkpoint恢复已认证状态(Redis MISS)',
      inviteCode: state.inviteCode,
      inviteCodeValidated: true,
      inviteeUserInfo: state.inviteeUserInfo,
      username,
      stream: [validatedMessage],
      chatMemory: [
        {
          role: 'assistant',
          content: state.inviteCode,
          type: 'message-invite-code-validated',
          timestamp: Date.now(),
        },
      ],
    };
  }

  const { chatModel } = tools;

  let result: IntentResult;
  try {
    result = await classifyIntent(chatModel, state.query);
  } catch (err) {
    Logger.error(
      `[意图路由] LLM调用失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'intentRouteNode',
    );
    result = {
      intent: 'general',
      reason: 'LLM调用异常，降级为通用',
      inviteCode: null,
    };
  }

  Logger.log(
    `[意图路由] 返回: intent=${result.intent} | inviteCode=${result.inviteCode || '(无)'} | reason=${result.reason}`,
    'intentRouteNode',
  );

  return {
    intent: result.intent,
    intentReason: result.reason,
    inviteCode: result.inviteCode,
    username,
  };
}

async function classifyIntent(
  chatModel: ChatOpenAI,
  lastUserMessage: string,
): Promise<IntentResult> {
  const agent = createAgent({
    model: chatModel,
    responseFormat: IntentSchema,
    systemPrompt: `你是意图分类路由器。分析用户最后一条消息的意图。

分类规则（按优先级排序）：
1. end_interview（结束面试）最高优先级: 用户明确表达结束或退出面试的意图。
   例如："结束面试"、"退出"、"再见"、"拜拜"、"不面了"、"今天就到这里"、"先这样吧"、"关闭面试"、"停止面试"、"我不想面试了"。
2. interviewer（面试官）最高覆盖面: 面试官角色提问，涵盖一切与候选人知识、能力、背景、项目相关的问题：
   - 技术知识问答："什么是闭包"、"栈和队列的区别"、"Redis持久化原理"
   - 编程/算法题："写一个快速排序"、"如何实现防抖"
   - 候选人项目/经历相关："你做过什么项目"、"介绍一下你的GitHub项目"、"聊聊你的工作经历"、"你用过哪些技术栈"、"你的项目里用了什么架构"、"分析一下项目X"、"这个仓库主要是做什么的"
   - 职业规划/软技能："程序员如何规划职业发展"、"如何平衡深度和广度"
   - 计算机基础："什么是操作系统"、"HTTP和HTTPS的区别"
   - 此外，如果用户消息是一串看起来像邀请码的字母数字组合，则归类为 interviewer 并提取为 inviteCode。
3. interviewee（面试者）: 用户明确想被面试、模拟面试、让AI出题考自己。
   例如："我想体验被面试"、"假装你是面试官来面试我"、"帮我模拟面试"、"你来面试我"
4. general（通用）: 严格仅限纯闲聊/寒暄/客套，如："你好"、"在吗"、"谢谢"、"今天天气不错"。
   【重要】凡是涉及技术、项目、代码、工作经历、知识问答的内容，一律归类为 interviewer，不得归类为 general。

用户消息：${lastUserMessage}`,
  });
  const response = await agent.invoke({ messages: [] });
  return response.structuredResponse as IntentResult;
}
