import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AnimatedPxlKitIcon,
  ParallaxPxlKitIcon,
  PxlKitIcon,
} from "@pxlkit/core";
import { BouncingArrow, Close, Play } from "@pxlkit/ui";
import { CoolEmoji, PixelCrown } from "@pxlkit/parallax";
import { User, WinkingFace } from "@pxlkit/social";

import { CoinSpin } from "@pxlkit/gamification";
import { useAuth } from "../../context/AuthContext";
import {
  getMemory,
  checkInviteCode,
  type IngestedRepo,
} from "../../api/interfaces";
import MessagePart from "./MessagePart";
import ParticleBackground from "./ParticleBackground";
import GithubProjectPanel from "./GithubProjectPanel";
import VoiceInput from "./VoiceInput";
import { useTtsWebSocket } from "../../hooks/useTtsWebSocket";
import "./index.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const THREAD_ID_KEY = "madao_thread_id";
const TEMPLATES = [
  "你做过什么项目",
  "你的工作经历是什么",
  "你的教育经历是什么",
  "你会什么技术栈",
];

function getLangIcon(language: string | null): string {
  if (!language) return "📁";
  if (language === "TypeScript" || language === "JavaScript") return "🟦";
  if (language === "Python") return "🟩";
  if (language === "Java") return "🟧";
  if (language === "Go") return "🟦";
  if (language === "Rust") return "🟪";
  if (language === "C++" || language === "C") return "🟫";
  return "📁";
}

const Chat = () => {
  const { user, loading, accessToken } = useAuth();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>();
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [searchParams] = useSearchParams();
  const urlInviteCode = searchParams.get("invite")?.trim() || null;
  const [redisInviteCode, setRedisInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const tid = localStorage.getItem(THREAD_ID_KEY);
    if (!tid) {
      setMemoryLoaded(true);
      return;
    }
    getMemory(tid)
      .then((res) => {
        const items = res.data.chatMemory ?? [];
        if (items.length > 0) {
          const msgs: UIMessage[] = items.map((item) => {
            const id = `mem-${item.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
            const role = item.role as "user" | "assistant";

            if (role === "assistant" && item.type) {
              const parts: UIMessage["parts"] = [];

              if (item.webSearch) {
                const wsToolCallId = `tc-ws-${item.timestamp}`;
                const wsContent = JSON.stringify(item.webSearch);
                parts.push({
                  type: "dynamic-tool" as const,
                  state: "output-available" as const,
                  toolName: "message",
                  toolCallId: wsToolCallId,
                  input: { type: "message-web-search", content: wsContent },
                  output: { type: "message-web-search", content: wsContent },
                } as UIMessage["parts"][number]);
              }

              const toolCallId = `tc-${item.timestamp}`;
              parts.push({
                type: "dynamic-tool" as const,
                state: "output-available" as const,
                toolName: "message",
                toolCallId,
                input: { type: item.type, content: item.content },
                output: { type: item.type, content: item.content },
              } as UIMessage["parts"][number]);

              return {
                id,
                role,
                content: item.content,
                parts,
              } as UIMessage;
            }

            return {
              id,
              role,
              content: item.content,
              parts: [{ type: "text" as const, text: item.content }],
            } as UIMessage;
          });
          setInitialMessages(msgs);
        }
        setMemoryLoaded(true);
      })
      .catch(() => {
        setMemoryLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    checkInviteCode()
      .then((res) => {
        if (res.data.validated && res.data.inviteCode) {
          setRedisInviteCode(res.data.inviteCode);
        }
      })
      .catch(() => {});
  }, [user]);

  if (loading || !memoryLoaded) {
    return (
      <div className="chat">
        <ParticleBackground />
        <div className="chat__loading">
          <span className="chat__loading-dot" />
          <span className="chat__loading-dot" />
          <span className="chat__loading-dot" />
        </div>
      </div>
    );
  }

  return (
    <ChatInner
      user={user}
      accessToken={accessToken}
      initialMessages={initialMessages}
      inviteCode={urlInviteCode}
      redisInviteCode={redisInviteCode}
      setRedisInviteCode={setRedisInviteCode}
    />
  );
};

const ChatInner = ({
  user,
  accessToken,
  initialMessages,
  inviteCode,
  redisInviteCode,
  setRedisInviteCode,
}: {
  user: ReturnType<typeof useAuth>["user"];
  accessToken: string | null;
  initialMessages: UIMessage[] | undefined;
  inviteCode: string | null;
  redisInviteCode: string | null;
  setRedisInviteCode: React.Dispatch<React.SetStateAction<string | null>>;
}) => {
  const loggedIn = !!user;
  const chatUrl = `${window.location.origin}${API_BASE}/ai/agui/stream`;

  const [chatInviteCode, setChatInviteCode] = useState<string | null>(null);
  const [sessionCleared, setSessionCleared] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<IngestedRepo | null>(null);
  const resolvedInviteCode = sessionCleared
    ? null
    : inviteCode || redisInviteCode || chatInviteCode;

  const threadIdRef = useRef<string | null>(
    localStorage.getItem(THREAD_ID_KEY),
  );
  const pendingResumeRef = useRef(false);
  const repoContextRef = useRef<string | null>(null);

  const {
    enabled: ttsEnabled,
    toggle: toggleTts,
    ensureTtsConnection,
    getSessionId,
    synthesize: ttsSynthesize,
  } = useTtsWebSocket();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatUrl,
        credentials: "include",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
        fetch: async (url, init) => {
          if (init?.body && typeof init.body === "string") {
            try {
              const parsed = JSON.parse(init.body);
              if (threadIdRef.current) {
                parsed.threadId = threadIdRef.current;
              }
              if (getSessionId()) {
                parsed.ttsSessionId = getSessionId();
              }
              if (pendingResumeRef.current) {
                const lastUserMsg = (parsed.messages || [])
                  .filter((m: any) => m.role === "user")
                  .at(-1);
                parsed.resume =
                  lastUserMsg?.parts?.find((p: any) => p.type === "text")
                    ?.text ?? "";
                pendingResumeRef.current = false;
              }
              if (repoContextRef.current) {
                const lastUserMsg = (parsed.messages || [])
                  .filter((m: any) => m.role === "user")
                  .at(-1);
                const textPart = lastUserMsg?.parts?.find(
                  (p: any) => p.type === "text",
                );
                if (textPart) {
                  textPart.text = repoContextRef.current + textPart.text;
                }
                repoContextRef.current = null;
              }
              init.body = JSON.stringify(parsed);
            } catch {
              // ignore parse error
            }
          }
          const response = await window.fetch(url, init);
          const tid = response.headers.get("X-Thread-Id");
          if (tid) {
            threadIdRef.current = tid;
            localStorage.setItem(THREAD_ID_KEY, tid);
          }
          return response;
        },
      }),
    [chatUrl, accessToken],
  );
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
    setMessages,
  } = useChat<UIMessage>({
    transport,
  });

  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        const toolTypes = new Set(["tool-invocation", "dynamic-tool"]);
        if (!toolTypes.has(part.type)) continue;
        const output = (part as any).output;
        if (
          output &&
          typeof output === "object" &&
          output.type === "message-invite-code-validated" &&
          typeof output.content === "string" &&
          output.content.length > 0
        ) {
          if (output.content !== chatInviteCode) {
            setChatInviteCode(output.content);
          }
          return;
        }
      }
    }
  }, [messages, chatInviteCode]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        const toolTypes = new Set(["tool-invocation", "dynamic-tool"]);
        if (!toolTypes.has(part.type)) continue;
        const output = (part as any).output;
        if (
          output &&
          typeof output === "object" &&
          output.type === "message-session-cleared"
        ) {
          setChatInviteCode(null);
          setRedisInviteCode(null);
          setSessionCleared(true);
          threadIdRef.current = null;
          localStorage.removeItem(THREAD_ID_KEY);
          return;
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    if (status !== "ready") return;
    const last = messages.filter((m) => m.role === "assistant").at(-1);
    if (!last) return;
    for (const part of last.parts) {
      const toolPartTypes = new Set(["tool-invocation", "dynamic-tool"]);
      if (!toolPartTypes.has(part.type)) continue;
      const output = (part as any).output;
      if (
        output &&
        typeof output === "object" &&
        output.type === "message-invite-code-required"
      ) {
        pendingResumeRef.current = true;
        return;
      }
    }
  }, [status, messages]);
  const [input, setInput] = useState("");
  const [coinKey, setCoinKey] = useState(0);
  const busy = status === "submitted" || status === "streaming";
  const canSend = status === "ready" && input.trim().length > 0;
  const lastAssistant = messages.filter((m) => m.role === "assistant").at(-1);
  const lastMessageRole = messages.at(-1)?.role;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  useEffect(() => {
    const shouldScroll = busy || lastMessageRole === "user" || isNearBottom();
    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({
        behavior: busy ? "instant" : "smooth",
      });
    }
  }, [messages, busy, lastMessageRole]);

  useEffect(() => {
    if (!busy) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isNearBottom()) {
        messagesEndRef.current?.scrollIntoView({
          behavior: "instant" as ScrollBehavior,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [busy]);

  const handleInputKeyDown = async (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (canSend) {
        if (ttsEnabled) {
          await ensureTtsConnection();
        }
        void sendMessage({ text: input });
        setInput("");
        setSelectedRepo(null);
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    if (ttsEnabled) {
      await ensureTtsConnection();
    }
    sendMessage({ text: input });
    setInput("");
    setSelectedRepo(null);
    setCoinKey((k) => k + 1);
  };

  const handleVoiceResult = async (text: string) => {
    if (status !== "ready") return;
    if (ttsEnabled) {
      await ensureTtsConnection();
    }
    sendMessage({ text });
    setSelectedRepo(null);
    setCoinKey((k) => k + 1);
  };

  const hasInvite = !!resolvedInviteCode;

  return (
    <div className={hasInvite ? "chat-wrapper" : ""}>
      {hasInvite && (
        <GithubProjectPanel
          inviteCode={resolvedInviteCode!}
          selectedRepo={selectedRepo}
          onSelectRepo={(repo) => {
            setSelectedRepo((prev) => {
              const isDeselect = prev?.repo === repo.repo;
              if (isDeselect) {
                repoContextRef.current = null;
                return null;
              }
              repoContextRef.current = ` [${repo.repo}](${repo.html_url})，该项目描述为：${repo.description || "无"}，主要使用 ${repo.language || "未知"} 语言，涉及技术主题：${repo.topics.join(" · ") || "无"}。\n\n用户提问：`;
              setInput("请详细查询并介绍该项目");
              return repo;
            });
          }}
        />
      )}
      <div className="chat">
        <ParticleBackground />
        <header className="chat__header">
          <div className="chat__brand">
            <span className="chat__brand-icon" aria-hidden="true">
              <AnimatedPxlKitIcon
                icon={WinkingFace}
                size={34}
                colorful
                trigger="hover"
              />
            </span>
            <h1 className="chat__title">AI面试助手</h1>
          </div>
        </header>

        <div className="chat__messages" ref={messagesContainerRef}>
          {messages.length === 0 && (
            <div className="chat__empty">
              <div className="chat__empty-icon" aria-hidden="true">
                <ParallaxPxlKitIcon
                  icon={PixelCrown}
                  size={62}
                  colorful
                  strength={12}
                />
              </div>
              <div className="chat__empty-text">
                <span className="chat__empty-text--text">
                  旅行者，请开始你的旅程吧~
                </span>
                <div className="chat__empty-text--text">
                  您可以选择扮演面试官或者面试者
                </div>
              </div>
              <div className="chat__templates-scroll">
                <div className="chat__templates-track">
                  {TEMPLATES.map((t) => (
                    <button
                      key={`a-${t}`}
                      className="chat__template-chip"
                      type="button"
                      disabled={status !== "ready"}
                      onClick={() => setInput(t)}
                    >
                      {t}
                    </button>
                  ))}
                  {TEMPLATES.map((t) => (
                    <button
                      key={`b-${t}`}
                      className="chat__template-chip"
                      type="button"
                      disabled={status !== "ready"}
                      onClick={() => setInput(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((message, i) => {
            const textPartIndices = message.parts
              .map((p, idx) => (p.type === "text" ? idx : -1))
              .filter((idx) => idx >= 0);
            const lastTextPartIdx = textPartIndices[textPartIndices.length - 1];

            return (
              <article
                key={message.id}
                className={`chat__message chat__message--${message.role}`}
                style={{ animationDelay: `${Math.min(i * 60, 280)}ms` }}
              >
                <div className="chat__message-col">
                  <div className="chat__message-avatar" aria-hidden="true">
                    {message.role === "assistant" ? (
                      <ParallaxPxlKitIcon
                        icon={CoolEmoji}
                        size={32}
                        colorful
                        strength={10}
                      />
                    ) : (
                      <PxlKitIcon icon={User} size={32} colorful />
                    )}
                  </div>
                  <span className="chat__message-role">
                    {message.role === "user" ? "面试官" : "分身"}
                  </span>
                </div>
                <div className="chat__message-body">
                  {message.parts.map((part, index) => (
                    <MessagePart
                      key={`${message.id}-p-${index}`}
                      part={part}
                      canCollapse={message.role !== "user"}
                      textStreamActive={
                        part.type === "text" &&
                        message.role === "assistant" &&
                        message.id === lastAssistant?.id &&
                        index === lastTextPartIdx &&
                        busy
                      }
                    />
                  ))}
                  {message.role === "assistant" &&
                    !busy &&
                    textPartIndices.length > 0 && (
                      <div className="chat__message-tts">
                        <button
                          className={`chat__tts-btn${ttsEnabled ? " chat__tts-btn--active" : ""}`}
                          type="button"
                          onClick={async () => {
                            console.log(
                              "[TTS] button clicked | ttsEnabled=",
                              ttsEnabled,
                            );
                            console.log(
                              "[TTS] part types:",
                              message.parts.map((p) => p.type),
                            );
                            if (ttsEnabled) {
                              toggleTts();
                              return;
                            }
                            toggleTts();
                            const text = message.parts
                              .filter((p) => p.type === "text")
                              .map((p) => p.text)
                              .join("");
                            console.log(
                              `[TTS] button text extracted | textLen=${text.length} | partsCount=${message.parts.length}`,
                            );
                            if (text) {
                              await ttsSynthesize(text);
                            } else {
                              console.warn(
                                "[TTS] button skipped: no text in message parts",
                              );
                            }
                          }}
                          title={ttsEnabled ? "关闭语音播报" : "播报本条回复"}
                          aria-label={
                            ttsEnabled ? "关闭语音播报" : "播报本条回复"
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            {ttsEnabled && (
                              <>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                              </>
                            )}
                          </svg>
                          <span className="chat__tts-label">
                            {ttsEnabled ? "语音播报中" : "语音播报"}
                          </span>
                        </button>
                      </div>
                    )}
                </div>
              </article>
            );
          })}
          {busy && messages.length > 0 && (
            <div className="chat__typing">
              <div className="chat__typing-avatar" aria-hidden="true">
                <AnimatedPxlKitIcon
                  icon={WinkingFace}
                  size={26}
                  colorful
                  trigger="loop"
                />
              </div>
              <span className="chat__typing-dot" />
              <span className="chat__typing-dot" />
              <span className="chat__typing-dot" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="chat__error" role="alert">
            <span className="chat__error-icon">!</span>
            <span className="chat__error-text">{error.message}</span>
            <button
              className="chat__error-dismiss"
              type="button"
              onClick={() => clearError()}
            >
              DISMISS
            </button>
          </div>
        )}

        <form className="chat__input-area" onSubmit={handleFormSubmit}>
          {selectedRepo && (
            <div className="chat__repo-reference">
              <span className="chat__repo-reference-icon">
                {getLangIcon(selectedRepo.language)}
              </span>
              <span className="chat__repo-reference-name">
                {selectedRepo.repo}
              </span>
              <button
                type="button"
                className="chat__repo-reference-close"
                onClick={() => setSelectedRepo(null)}
                aria-label="取消引用"
              >
                ×
              </button>
            </div>
          )}
          <div className="chat__input-row">
            <div className="chat__input-wrapper">
              <textarea
                className="chat__input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="输入消息 · Enter 发送 · Ctrl+Enter 换行"
                rows={3}
                disabled={status !== "ready"}
                aria-label="消息输入"
              />
            </div>
            <div className="chat__input-actions">
              <div className="chat__status-bar">
                <div className="chat__status-bar-inner">
                  <span className="chat__status-icon">
                    {status === "ready" && (
                      <AnimatedPxlKitIcon
                        icon={BouncingArrow}
                        size={14}
                        colorful
                        trigger="loop"
                      />
                    )}
                    {(status === "submitted" || status === "streaming") && (
                      <PxlKitIcon icon={Play} size={14} colorful />
                    )}
                    {status === "error" && (
                      <PxlKitIcon icon={Close} size={14} colorful />
                    )}
                  </span>
                  <span className="chat__status-text">
                    {status === "ready" && "就绪"}
                    {status === "submitted" && "发送中 ..."}
                    {status === "streaming" && "AI 正在作答 ..."}
                    {status === "error" && "连接错误"}
                  </span>
                </div>
              </div>
              <div className="chat__input-actions-row">
                <VoiceInput
                  onResult={handleVoiceResult}
                  disabled={!loggedIn || status !== "ready"}
                />
                <button
                  className={`chat__send-btn${busy ? " chat__send-btn--busy" : ""}`}
                  type={busy ? "button" : "submit"}
                  disabled={!busy && !canSend}
                  onClick={
                    busy
                      ? () => {
                          stop();
                          setCoinKey((k) => k + 1);
                        }
                      : undefined
                  }
                  aria-label={busy ? "停止生成" : "发送消息"}
                >
                  <span className="chat__send-btn-icon" key={coinKey}>
                    <AnimatedPxlKitIcon icon={CoinSpin} size={20} colorful />
                  </span>
                  <span
                    className={`chat__send-btn-label${busy ? " chat__send-btn-label--stop" : ""}`}
                  >
                    {busy ? "→ 停止" : "→ 发送"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
export default Chat;
