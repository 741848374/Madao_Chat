import { ChatOpenAI } from '@langchain/openai';
import { Logger } from '@nestjs/common';

export async function generateNode(
  state: any,
  tools: { chatModel: ChatOpenAI },
) {
  const messages = state.messages ?? [];
  const lastUserMessage = messages[messages.length - 1]?.content ?? '';

  Logger.log(
    `[通用生成] 进入 | msg="${lastUserMessage.slice(0, 50)}"`,
    'generateNode',
  );

  if (!lastUserMessage) {
    Logger.warn('[通用生成] 返回: 无用户消息，跳过 → END', 'generateNode');
    return { generation: 'empty', stream: [] };
  }

  Logger.log('[通用生成] 调用LLM生成回复', 'generateNode');

  try {
    const response = await tools.chatModel.invoke([
      { role: 'user', content: lastUserMessage },
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    Logger.log(
      `[通用生成] 返回: 已生成回复(${content.length}字符) → END`,
      'generateNode',
    );

    return {
      generation: 'generated',
      stream: [{ type: 'message-generate', content }],
      chatMemory: [
        {
          role: 'user',
          content: lastUserMessage,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content,
          type: 'message-generate',
          timestamp: Date.now(),
        },
      ],
    };
  } catch (err) {
    Logger.error(
      `[通用生成] LLM调用失败: ${err}`,
      err instanceof Error ? err.stack : undefined,
      'generateNode',
    );
    return { generation: 'error', stream: [] };
  }
}
