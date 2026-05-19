import { AnimatedPxlKitIcon } from "@pxlkit/core";
import { BouncingBall } from "@pxlkit/gamification";

const ToolPendingPanel = ({ name, hint }: { name: string; hint?: string }) => {
  return (
    <div className="chat-tool chat-tool--pending" aria-busy="true">
      <span className="chat-tool__pending-icon">
        <AnimatedPxlKitIcon
          icon={BouncingBall}
          size={20}
          colorful
          trigger="loop"
        />
      </span>
      <span className="chat-tool__pending-text">
        Calling <strong>{name}</strong>
        {hint ? <span className="chat-tool__hint">：{hint}</span> : "..."}
      </span>
    </div>
  );
};
export default ToolPendingPanel;
