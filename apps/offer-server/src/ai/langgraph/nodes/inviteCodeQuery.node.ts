import { Tool } from '@langchain/core/tools';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { User } from '../../../auth/entities/User.entity';
import { RedisService } from '../../../redis/redis.service';

const INVITE_CODE_INVALID = '邀请码无效，请检查后重新输入';

const REDIS_PREFIX = 'invite_code:';
const REDIS_TTL = 3600;

export async function inviteCodeQueryNode(
  state: any,
  tools: {
    userRepository: Repository<User>;
    messageTool: Tool;
    redisService: RedisService;
  },
  config?: LangGraphRunnableConfig,
) {
  const inviteCode: string | null = state.inviteCode;
  const username: string = state.username;
  // 诊断: 追踪username在graph中的传递
  Logger.log(
    `[邀请码查询|诊断] state详情 | state.username="${state.username ?? '(undefined)'}" | state.inviteCode="${state.inviteCode || '(无)'}" | state.inviteCodeValidated=${state.inviteCodeValidated} | state.generation="${state.generation}"`,
    'inviteCodeQueryNode',
  );

  Logger.log(
    `[邀请码查询] 进入 | inviteCode="${inviteCode || '(无)'}" | username="${username || '(无)'}"`,
    'inviteCodeQueryNode',
  );

  if (!inviteCode) {
    Logger.warn(
      '[邀请码查询] 分支: inviteCode为空 | 返回邀请码无效',
      'inviteCodeQueryNode',
    );
    const result = await tools.messageTool.invoke({
      type: 'message-invite-code-invalid',
      content: INVITE_CODE_INVALID,
    });
    return {
      stream: [result],
      generation: 'inviteCodeInvalid',
      inviteCode: null,
    };
  }

  Logger.log(
    `[邀请码查询] 查询数据库 | inviteCode="${inviteCode}"`,
    'inviteCodeQueryNode',
  );

  let user: User | null;
  try {
    user = await tools.userRepository.findOne({
      where: { inviteCode },
    });
  } catch (err) {
    Logger.error(
      `[邀请码查询] 数据库查询失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'inviteCodeQueryNode',
    );
    const result = await tools.messageTool.invoke({
      type: 'message-invite-code-invalid',
      content: INVITE_CODE_INVALID,
    });
    return {
      stream: [result],
      generation: 'inviteCodeInvalid',
      inviteCode: null,
    };
  }

  if (!user) {
    Logger.warn(
      `[邀请码查询] 返回: 用户不存在 | inviteCode="${inviteCode}"`,
      'inviteCodeQueryNode',
    );
    const result = await tools.messageTool.invoke({
      type: 'message-invite-code-invalid',
      content: INVITE_CODE_INVALID,
    });
    return {
      stream: [result],
      generation: 'inviteCodeInvalid',
      inviteCode: null,
    };
  }

  const userInfo = {
    id: user.id,
    username: user.username,
    email: user.email,
  };

  const redisUsername = username || user.username;
  Logger.log(
    `[邀请码查询|诊断] Redis key决策 | state.username="${username || '(空)'}" | user.username="${user.username}" | 最终使用="${redisUsername}"`,
    'inviteCodeQueryNode',
  );

  if (redisUsername) {
    try {
      await tools.redisService.set(
        REDIS_PREFIX + redisUsername,
        JSON.stringify({ inviteCode, userInfo }),
        REDIS_TTL,
      );
      Logger.log(
        `[邀请码查询] Redis缓存写入成功 | key="${REDIS_PREFIX}${redisUsername}" | ttl=${REDIS_TTL}s`,
        'inviteCodeQueryNode',
      );
      // 诊断: 立即回读确认写入成功
      const verifyVal = await tools.redisService.get(
        REDIS_PREFIX + redisUsername,
      );
      Logger.log(
        `[邀请码查询|诊断] 回读验证 | key="${REDIS_PREFIX}${redisUsername}" | 回读结果=${verifyVal ? '有值' : 'NULL'} | TTL=${REDIS_TTL}s`,
        'inviteCodeQueryNode',
      );
    } catch (err) {
      Logger.error(
        `[邀请码查询] Redis缓存写入失败: ${err}`,
        err instanceof Error ? err.stack : undefined,
        'inviteCodeQueryNode',
      );
    }
  }

  if (config?.configurable?.thread_id) {
    const threadKey = `invite_code_thread:${config.configurable.thread_id}`;
    try {
      await tools.redisService.set(
        threadKey,
        JSON.stringify({ inviteCode, userInfo }),
        REDIS_TTL,
      );
      Logger.log(
        `[邀请码查询] threadId缓存写入 | key="${threadKey}" | ttl=${REDIS_TTL}s`,
        'inviteCodeQueryNode',
      );
    } catch (err) {
      Logger.error(
        `[邀请码查询] threadId缓存写入失败: ${err}`,
        err instanceof Error ? err.stack : undefined,
        'inviteCodeQueryNode',
      );
    }
  } else {
    Logger.warn(
      `[邀请码查询|诊断] redisUsername为空，跳过Redis缓存写入 | inviteCode="${inviteCode}" | state.username="${state.username ?? '(undefined)'}" | user.username="${user.username}"`,
      'inviteCodeQueryNode',
    );
  }

  Logger.log(
    `[邀请码查询] 返回: 校验通过 | user=${userInfo.username}(id=${userInfo.id})`,
    'inviteCodeQueryNode',
  );

  const validatedMessage = await tools.messageTool.invoke({
    type: 'message-invite-code-validated',
    content: inviteCode,
  });

  return {
    stream: [validatedMessage],
    inviteCodeValidated: true,
    inviteCode: inviteCode,
    inviteeUserInfo: userInfo,
    username: redisUsername,
    generation: 'inviteCodeValidated',
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
