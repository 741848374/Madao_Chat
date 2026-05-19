import { isToolUIPart } from "ai";
import { StreamdownText } from "../StreamdownText";
import ToolMessagePart from "../ToolMessagePart";
import type { MessagePartProps } from "../../../type/index";

const MessagePart = ({
  part,
  textStreamActive,
  canCollapse,
}: MessagePartProps & { textStreamActive: boolean; canCollapse?: boolean }) => {
  if (part.type === "text") {
    return (
      <StreamdownText isStreaming={textStreamActive} canCollapse={canCollapse}>
        {part.text}
      </StreamdownText>
    );
  }
  if (isToolUIPart(part)) {
    return <ToolMessagePart part={part} />;
  }

  return null;
};
export default MessagePart;
