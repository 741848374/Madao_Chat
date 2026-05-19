import { useState, useRef, useCallback, useEffect } from "react";
import { recognizeSpeech } from "../../../api/interfaces";
import "./index.css";

type VoiceState = "idle" | "recording" | "processing" | "error";

interface VoiceInputProps {
  onResult: (text: string) => void;
  disabled?: boolean;
}

const VoiceInput = ({ onResult, disabled }: VoiceInputProps) => {
  const [state, setState] = useState<VoiceState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMimeType = "audio/ogg;codecs=opus";
      const mediaRecorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          setState("idle");
          return;
        }

        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        chunksRef.current = [];

        setState("processing");
        try {
          const res = await recognizeSpeech(blob);
          const text =
            typeof res.data === "string" ? res.data : String(res.data ?? "");
          if (text.trim()) {
            onResult(text.trim());
          }
          setState("idle");
        } catch {
          setState("error");
          errorTimerRef.current = setTimeout(() => setState("idle"), 2000);
        }
      };

      mediaRecorder.start();
      setState("recording");
    } catch {
      setState("error");
      errorTimerRef.current = setTimeout(() => setState("idle"), 2000);
    }
  }, [disabled, onResult]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleClick = useCallback(() => {
    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }, [state, startRecording, stopRecording]);

  const isInteractive = state === "idle" || state === "recording";
  const label = {
    idle: "语音输入",
    recording: "点击停止",
    processing: "识别中...",
    error: "识别失败",
  }[state];

  return (
    <button
      className={`voice-input voice-input--${state}`}
      type="button"
      onClick={handleClick}
      disabled={disabled || !isInteractive}
      aria-label={label}
      title={label}
    >
      <span className="voice-input__icon" aria-hidden="true">
        {state === "recording" && <span className="voice-input__pulse" />}
        <svg
          className="voice-input__mic"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </span>
      {state === "processing" && (
        <span className="voice-input__spinner" aria-hidden="true" />
      )}
    </button>
  );
};

export default VoiceInput;
