import { Tool } from 'langchain';
import { Logger } from '@nestjs/common';

const NOT_AVAILABLE_MSG = '开发中...暂时无法使用';

export async function notAvailableNode(
  state: any,
  tools: { messageTool: Tool },
) {
  Logger.log(
    `[不可用] 进入 | intent=${state.intent} | msg="${NOT_AVAILABLE_MSG}"`,
    'notAvailableNode',
  );

  const result = await tools.messageTool.invoke({
    type: 'message-not-available',
    content: NOT_AVAILABLE_MSG,
  });

  Logger.log('[不可用] 返回: 发送不可用消息 → END', 'notAvailableNode');

  return {
    stream: [result],
    generation: 'token',
    chatMemory: [
      {
        role: 'assistant',
        content: NOT_AVAILABLE_MSG,
        type: 'message-not-available',
        timestamp: Date.now(),
      },
    ],
  };
}
