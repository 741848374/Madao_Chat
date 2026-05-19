import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { tool } from '@langchain/core/tools';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { AIMessageChunk, Tool, ToolMessageChunk } from 'langchain';
import z from 'zod';

/**
 * 合并两个异步可迭代对象
 * @param existingStream 现有的stream
 * @param newStream 新的stream
 * @returns 合并后的ReadableStream
 */
// function mergeStreams(existingStream: any, newStream: any): ReadableStream {
//   return new ReadableStream({
//     async start(controller) {
//       if (existingStream) {
//         for await (const chunk of existingStream) {
//           controller.enqueue(chunk);
//         }
//       }
//       for await (const chunk of newStream) {
//         controller.enqueue(chunk);
//       }
//       controller.close();
//     },
//   });
// }

import { Logger } from '@nestjs/common';
export async function messageNode(state: any, messageTool: Tool) {
  //给客户端输出搜索中
  Logger.log('messageNode', state);

  const stream = await messageTool.invoke({
    type: 'message-hello',
    content: '你好',
  });

  // 转换为 UI 消息流
  //   await config.writer?.({
  //     type: 'token', // 事件类型，前端可据此分类处理
  //     message: stream,
  //     progress: 0.1,
  //   });

  // const uiStream = await toUIMessageStream(
  //   stream as AsyncIterable<AIMessageChunk<any>>,
  // );

  return {
    stream: [stream],
    generation: 'token',
  };
}
