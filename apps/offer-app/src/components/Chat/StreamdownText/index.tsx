import { useState } from "react";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import rehypeRaw from "rehype-raw";
import { defaultRehypePlugins, Streamdown, type ThemeInput } from "streamdown";
import "streamdown/styles.css";
import "./index.css";

const shikiTheme: [ThemeInput, ThemeInput] = ["github-light", "github-dark"];

const codePlugin = createCodePlugin({ themes: shikiTheme });

export type StreamdownTextProps = {
  children: string;
  /** 助手最后一段文本在流式输出时为 true，用于 Streamdown 动画与未闭合 Markdown */
  isStreaming?: boolean;
  /** 是否允许折叠，默认 true */
  canCollapse?: boolean;
};

export function StreamdownText({
  children,
  isStreaming = false,
  canCollapse = true,
}: StreamdownTextProps) {
  const [folded, setFolded] = useState(true);
  const canFold = canCollapse && !isStreaming;
  const isFolded = canFold && folded;

  return (
    <div
      className={`chat-streamdown-fold${isFolded ? " chat-streamdown-fold--folded" : ""}`}
    >
      {canFold && (
        <button
          className="chat-streamdown-fold__header"
          type="button"
          onClick={() => setFolded((f) => !f)}
          aria-expanded={!isFolded}
        >
          <span className="chat-streamdown-fold__label">CODE</span>
          <span className="chat-streamdown-fold__chevron" aria-hidden="true">
            ▸
          </span>
        </button>
      )}
      <div
        className={`chat-streamdown-fold__body${isFolded ? " chat-streamdown-fold__body--folded" : ""}`}
      >
        <Streamdown
          mode="streaming"
          isAnimating={isStreaming}
          parseIncompleteMarkdown
          shikiTheme={shikiTheme}
          plugins={{ mermaid, code: codePlugin }}
          rehypePlugins={[...Object.values(defaultRehypePlugins), rehypeRaw]}
          className="chat-streamdown__inner"
        >
          {children}
        </Streamdown>
      </div>
    </div>
  );
}
