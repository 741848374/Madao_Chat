import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { createAgent } from 'langchain';
import { Logger } from '@nestjs/common';
import { Tool } from '@langchain/core/tools';
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

分类规则：
- interviewer（面试官）: 面试官角色提问、技术知识问答、编程问题、算法题、计算机基础问题等。
  例如："我是面试官"、"什么是闭包"、"栈和队列的区别"、"请开始面试"
- interviewee（面试者）: 用户想被面试、模拟面试、让AI出题考自己。
  例如："我想体验被面试"、"假装你是面试官来面试我"、"帮我模拟面试"
- general（通用）: 仅限纯闲聊/问候，如："你好"、"在吗"。技术问题不属于此类。
- end_interview（结束面试）: 用户明确表达结束或退出面试的意图。
  例如："结束面试"、"退出"、"再见"、"拜拜"、"不面了"、"今天就到这里"、"先这样吧"、"关闭面试"、"停止面试"、"我不想面试了"。

额外规则：
且用户本次回复是一串字符，则将意图归类为 interviewer，并提取该字符串作为 inviteCode。

用户消息：${lastUserMessage}`,
  });
  const response = await agent.invoke({ messages: [] });
  return response.structuredResponse as IntentResult;
}
