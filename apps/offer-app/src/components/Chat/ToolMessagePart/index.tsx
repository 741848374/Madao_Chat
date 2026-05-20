import { getToolName } from "ai";
import type { AnyToolPart, JsonValue } from "../../../type/index";
import ToolErrorPanel from "./ToolErrorPanel";
import ToolPendingPanel from "./ToolPendingPanel";
import NotAvailableOutput from "./NotAvailableOutput";
import InviteCodePrompt from "./InviteCodePrompt";
import WebSearchOutput from "./WebSearchOutput";
import "./index.css";

function streamValueToJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    return value as JsonValue[];
  }
  if (typeof value === "object") {
    return value as JsonValue;
  }
  return undefined;
}

function getPendingHint(
  _name: string,
  _inputJson: JsonValue | undefined,
): string | undefined {
  return undefined;
}
function parseMessage(rawOut: unknown): { type: string; rawContent: string } {
  const type =
    rawOut && typeof rawOut === "object" && "type" in rawOut
      ? String(rawOut["type"])
      : "";
  const rawContent =
    rawOut && typeof rawOut === "object" && "content" in rawOut
      ? String(rawOut["content"])
      : "";
  return { type, rawContent };
}

const ToolMessagePart = ({ part }: { part: AnyToolPart }) => {
  const name = getToolName(part);

  if (part.state === "output-error") {
    return (
      <ToolErrorPanel name={name} message={part.errorText ?? "工具执行出错"} />
    );
  }
  if (part.state === "input-streaming" || part.state === "input-available") {
    if (name === "message") return null;
    const inputJson = streamValueToJson(
      "input" in part ? part.input : undefined,
    );
    const hint = getPendingHint(name, inputJson);
    return <ToolPendingPanel name={name} hint={hint} />;
  }
  const rawOut = part.output;
  if (name !== "message") {
    return null;
  }

  const { type, rawContent } = parseMessage(rawOut);
  const content = rawContent.replace(/\\n/g, "\n");

  switch (type) {
    case "message-answer":
      return null;

    case "message-summary":
      return (
        <div className="chat-tool chat-tool--summary">
          <div className="chat-tool__summary-body">
            <div className="chat-tool__summary-text">
              {content.replace(/^##\s*面试总结\s*\n*/g, "")}
            </div>
          </div>
        </div>
      );

    case "message-no-question":
      return (
        <div className="chat-tool chat-tool--hint">
          <span className="chat-tool__hint-icon" aria-hidden="true">
            💬
          </span>
          <span className="chat-tool__hint-text">
            {content || "请面试官提问问题"}
          </span>
        </div>
      );

    case "message-invite-code-required":
      return <InviteCodePrompt content={content || "请输入您的面试邀请码"} />;

    case "message-invite-code-invalid":
      return (
        <ToolErrorPanel
          name="邀请码"
          message={content || "邀请码无效，请检查后重新输入"}
        />
      );

    case "message-invite-code-validated":
      return null;

    case "message-not-available":
      return (
        <NotAvailableOutput content={content || "前端开发中，暂时无法使用"} />
      );

    case "message-hello":
      return (
        <div className="chat-tool chat-tool--greeting">
          <div className="chat-tool__greeting-body">
            <span className="chat-tool__greeting-text">
              {content || "你好"}
            </span>
          </div>
        </div>
      );

    case "message-web-search":
      return <WebSearchOutput content={content} />;

    default:
      return (
        <NotAvailableOutput content={content || "前端开发中，暂时无法使用"} />
      );
  }
};

export default ToolMessagePart;
