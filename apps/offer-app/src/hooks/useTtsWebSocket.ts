import { useCallback, useEffect, useRef, useState } from "react";

const TTS_SERVER = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export function useTtsWebSocket() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingBuffersRef = useRef<ArrayBuffer[]>([]);
  const streamFinalRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  /* ========== 重置音频播放器，释放内存资源 ========== */
  const resetTtsPlayer = useCallback(() => {
    console.log("[TTS] resetTtsPlayer");
    pendingBuffersRef.current = [];
    streamFinalRef.current = false;
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  /* ========== 消费音频缓冲队列：逐帧追加到 SourceBuffer ========== */
  const flushTtsBufferQueue = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    const mediaSource = mediaSourceRef.current;
    if (!sourceBuffer || !mediaSource) return;
    if (sourceBuffer.updating) return;

    if (pendingBuffersRef.current.length > 0) {
      const next = pendingBuffersRef.current.shift();
      if (next) {
        console.log(
          `[TTS] appendBuffer | size=${next.byteLength} | remaining=${pendingBuffersRef.current.length}`,
        );
        sourceBuffer.appendBuffer(next);
        audioRef.current?.play().catch(() => {});
      }
      return;
    }

    if (streamFinalRef.current && mediaSource.readyState === "open") {
      try {
        console.log("[TTS] endOfStream");
        mediaSource.endOfStream();
      } catch {
        // ignore
      }
    }
  }, []);

  /* ========== 初始化 MediaSource 流式音频容器 ========== */
  const prepareStreamingAudio = useCallback(() => {
    console.log("[TTS] prepareStreamingAudio");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    if (mediaSourceRef.current) {
      if (mediaSourceRef.current.readyState === "open") {
        try {
          mediaSourceRef.current.endOfStream();
        } catch {
          // ignore
        }
      }
      mediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
    streamFinalRef.current = false;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!window.MediaSource || !MediaSource.isTypeSupported("audio/mpeg")) {
      console.warn(
        "[TTS] MediaSource not supported or audio/mpeg not available",
      );
      return;
    }

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    objectUrlRef.current = URL.createObjectURL(mediaSource);

    const audio = new Audio();
    audioRef.current = audio;
    audio.src = objectUrlRef.current;

    mediaSource.addEventListener("sourceopen", () => {
      console.log("[TTS] MediaSource sourceopen");
      if (!mediaSourceRef.current) return;
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBuffer.mode = "sequence";
      sourceBufferRef.current = sourceBuffer;

      sourceBuffer.addEventListener("updateend", flushTtsBufferQueue);
      sourceBuffer.addEventListener("error", (e) => {
        console.error("[TTS] SourceBuffer error:", e);
      });

      flushTtsBufferQueue();
    });
  }, [flushTtsBufferQueue]);

  /* ========== 关闭 WebSocket 连接 ========== */
  const closeTtsWs = useCallback(() => {
    console.log("[TTS] closeTtsWs");
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionIdRef.current = null;
    resetTtsPlayer();
  }, [resetTtsPlayer]);

  /* ========== 确保 TTS WebSocket 连接，返回 sessionId ========== */
  const ensureTtsConnection = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        sessionIdRef.current
      ) {
        resolve(sessionIdRef.current);
        return;
      }

      closeTtsWs();

      const wsUrl = new URL("/speech/tts/ws", TTS_SERVER);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(wsUrl.toString());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[TTS] WS connected");
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            console.log(
              `[TTS] WS message | type=${msg.type}${msg.sessionId ? ` | sessionId=${msg.sessionId.slice(0, 8)}` : ""}${msg.reason ? ` | reason=${msg.reason}` : ""}`,
            );
            if (msg.type === "session" && msg.sessionId) {
              sessionIdRef.current = msg.sessionId;
              resolve(msg.sessionId);
            } else if (msg.type === "tts_started") {
              if (enabledRef.current) {
                prepareStreamingAudio();
              }
            } else if (msg.type === "tts_final" || msg.type === "tts_closed") {
              streamFinalRef.current = true;
              flushTtsBufferQueue();
            } else if (msg.type === "tts_error") {
              streamFinalRef.current = true;
              flushTtsBufferQueue();
            }
          } catch {
            // ignore
          }
        } else if (event.data instanceof ArrayBuffer) {
          if (enabledRef.current) {
            console.log(
              `[TTS] audio chunk received | size=${event.data.byteLength} | queue=${pendingBuffersRef.current.length}`,
            );
            pendingBuffersRef.current.push(event.data);
            flushTtsBufferQueue();
          }
        }
      };

      ws.onerror = () => {
        console.error("[TTS] WS error, closing");
        closeTtsWs();
        resolve("");
      };

      ws.onclose = () => {
        console.log("[TTS] WS disconnected");
        wsRef.current = null;
      };
    });
  }, [closeTtsWs, prepareStreamingAudio, flushTtsBufferQueue]);

  /* ========== 获取当前 sessionId（非阻塞） ========== */
  const getSessionId = useCallback(() => {
    return sessionIdRef.current;
  }, []);

  /* ========== 直接合成语音：向 WebSocket 发送文本触发后端 TTS ========== */
  const synthesize = useCallback(
    async (text: string) => {
      console.log(`[TTS] synthesize called | textLen=${text.length}`);
      const sid = await ensureTtsConnection();
      if (
        !sid ||
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN
      ) {
        console.warn(
          `[TTS] synthesize aborted | sid=${sid?.slice(0, 8) ?? "null"} | wsReady=${wsRef.current?.readyState}`,
        );
        return;
      }
      console.log(
        `[TTS] synthesize sending | sessionId=${sid.slice(0, 8)} | textLen=${text.length}`,
      );
      wsRef.current.send(JSON.stringify({ type: "synthesize", text }));
    },
    [ensureTtsConnection],
  );

  /* ========== 切换语音播报开/关 ========== */
  const toggle = useCallback(() => {
    const next = !enabled;
    console.log(`[TTS] toggle | ${enabled ? "ON→OFF" : "OFF→ON"}`);
    enabledRef.current = next;
    setEnabled(next);
    if (!next) {
      resetTtsPlayer();
    }
  }, [enabled, resetTtsPlayer]);

  useEffect(() => {
    return () => {
      closeTtsWs();
    };
  }, [closeTtsWs]);

  return {
    enabled,
    toggle,
    ensureTtsConnection,
    getSessionId,
    synthesize,
    closeTtsWs,
  };
}
