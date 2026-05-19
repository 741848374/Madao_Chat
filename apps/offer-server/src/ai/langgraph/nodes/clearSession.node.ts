import { Tool } from '@langchain/core/tools';
import { Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

const REDIS_PREFIX = 'invite_code:';
const GOODBYE_MSG =
  '面试已结束，感谢您的使用。如需重新开始面试，请重新输入邀请码。';

export async function clearSessionNode(
  state: any,
  tools: { messageTool: Tool; redisService: RedisService },
) {
  const username: string = state.username ?? '';
  const redisKey = REDIS_PREFIX + username;

  Logger.log(
    `[清除会话] 进入 | username="${username || '(无)'}" | key="${redisKey}"`,
    'clearSessionNode',
  );
  Logger.log(
    `[清除会话|诊断] 状态快照 | intent="${state.intent}" | inviteCode="${state.inviteCode || '(无)'}" | inviteCodeValidated=${state.inviteCodeValidated} | generation="${state.generation}"`,
    'clearSessionNode',
  );

  if (username) {
    try {
      const existed = await tools.redisService.get(redisKey);
      if (existed) {
        await tools.redisService.del(redisKey);
        Logger.log(
          `[清除会话] Redis删除成功 | key="${redisKey}"`,
          'clearSessionNode',
        );
      } else {
        Logger.log(
          `[清除会话] Redis key不存在，跳过删除 | key="${redisKey}"`,
          'clearSessionNode',
        );
      }
    } catch (err) {
      Logger.error(
        `[清除会话] Redis删除失败: ${err}`,
        err instanceof Error ? err.stack : undefined,
        'clearSessionNode',
      );
    }
  }

  const result = await tools.messageTool.invoke({
    type: 'message-session-cleared',
    content: GOODBYE_MSG,
  });

  Logger.log('[清除会话] 返回: 发送结束消息 → END', 'clearSessionNode');

  return {
    stream: [result],
    generation: 'sessionCleared',
    inviteCode: null,
    inviteCodeValidated: false,
    inviteeUserInfo: null,
    intent: '',
    intentReason: '',
    chatMemory: [
      {
        role: 'assistant',
        content: GOODBYE_MSG,
        type: 'message-session-cleared',
        timestamp: Date.now(),
      },
    ],
  };
}
