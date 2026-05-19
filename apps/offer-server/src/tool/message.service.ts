import { tool } from '@langchain/core/tools';
import z from 'zod';

export class MessageService {
  readonly tool: ReturnType<typeof tool>;
  constructor() {
    const messageSchema = z.object({
      type: z.string().describe('message-hello'),
      content: z.string().describe('消息内容'),
    });

    this.tool = tool(
      async ({ type, content }) => {
        return {
          type,
          content,
        };
      },
      {
        name: 'message',
        description: 'useful for when you want to message',
        schema: messageSchema,
      },
    );
  }
}
