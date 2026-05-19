import "./index.css";

const InviteCodePrompt = ({ content }: { content: string }) => {
  return (
    <div className="chat-tool chat-tool--invite-prompt">
      <span className="chat-tool__invite-prompt-text">{content}</span>
    </div>
  );
};

export default InviteCodePrompt;
