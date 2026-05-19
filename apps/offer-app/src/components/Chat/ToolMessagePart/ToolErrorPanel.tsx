const ToolErrorPanel = ({
  name,
  message,
}: {
  name: string;
  message: string;
}) => {
  return (
    <div className="chat-tool chat-tool--error" role="alert">
      <div className="chat-tool__error-name">{name}</div>
      <p className="chat-tool__error-message">{message}</p>
    </div>
  );
};
export default ToolErrorPanel;
