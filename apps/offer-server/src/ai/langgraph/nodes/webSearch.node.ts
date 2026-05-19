import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { AIMessageChunk, Tool, ToolMessageChunk } from 'langchain';

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

export async function webSearchNode(
  state: any,
  webSearchTool: Tool,
  config: LangGraphRunnableConfig,
) {
  //给客户端输出搜索中
  const messages = state.messages;

  console.log('lcMessages', messages);
  const stream = await webSearchTool.invoke(
    { query: messages[0].content },
    { configurable: { streamMode: ['messages'] } },
  );
  // 转换为 UI 消息流
  await config.writer?.({
    type: 'webSearch', // 事件类型，前端可据此分类处理
    message: stream,
    progress: 0.1,
  });
  // const uiStream = await toUIMessageStream(
  //   stream as AsyncIterable<AIMessageChunk<any>>,
  // );
  console.log('stream给客户端输出搜索中', stream);
  return {
    stream: [stream],
    generation: 'webSearch',
  };
}
