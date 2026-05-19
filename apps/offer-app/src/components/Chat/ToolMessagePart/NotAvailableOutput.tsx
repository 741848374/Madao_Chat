import "./index.css";

const NotAvailableOutput = ({ content }: { content: string }) => {
  return (
    <div className="chat-tool chat-tool--not-available">
      <div className="chat-tool__na-header">
        <span className="chat-tool__na-icon" aria-hidden="true">
          ⏳
        </span>
        <span className="chat-tool__na-label">SYSTEM</span>
      </div>
      <div className="chat-tool__na-body">
        <p className="chat-tool__na-text">{content}</p>
      </div>
    </div>
  );
};

export default NotAvailableOutput;
