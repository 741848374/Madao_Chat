import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
// 工具输出类型
export type AnyToolPart = ToolUIPart | DynamicToolUIPart;
// 搜索工具输出类型
export type WebSearchToolOutput = string;
// 流式 / 工具里常见的可 JSON 序列化值（不含 unknown）
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

// 消息部分类型
export type MessagePartProps = {
  part: UIMessage["parts"][number];
};
