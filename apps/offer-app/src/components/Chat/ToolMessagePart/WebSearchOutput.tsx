import { useState } from "react";
import "./index.css";

interface WebSearchPage {
  title: string;
  url: string;
  summary: string;
  siteName: string;
  siteIcon: string;
  dateLastCrawled: string;
}

interface WebSearchResults {
  query: string;
  results: WebSearchPage[];
}

function parseWebSearchContent(content: string): WebSearchResults | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed.query === "string" &&
      Array.isArray(parsed.results)
    ) {
      return parsed as WebSearchResults;
    }
    return null;
  } catch {
    return null;
  }
}

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 10);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return raw.slice(0, 10);
  }
}

const WebSearchOutput = ({ content }: { content: string }) => {
  const [folded, setFolded] = useState(true);
  const data = parseWebSearchContent(content);

  if (!data || !data.results.length) {
    return (
      <div className="chat-tool chat-tool--web-search">
        <div className="chat-tool__ws-header">
          <span className="chat-tool__ws-icon" aria-hidden="true">
            🔍
          </span>
          <span className="chat-tool__ws-label">联网搜索</span>
        </div>
        <div className="chat-tool__ws-body">
          <p className="chat-tool__ws-empty">未获取到有效搜索结果</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-tool chat-tool--web-search${folded ? " chat-tool--web-search-folded" : ""}`}
    >
      <button
        className="chat-tool__ws-header chat-tool__ws-header--toggle"
        type="button"
        onClick={() => setFolded((f) => !f)}
        aria-expanded={!folded}
      >
        <span className="chat-tool__ws-icon" aria-hidden="true">
          🌐
        </span>
        <span className="chat-tool__ws-label">联网搜索</span>
        <span className="chat-tool__ws-count">
          {data.results.length} 条结果
        </span>
        <span className="chat-tool__ws-chevron" aria-hidden="true">
          ▸
        </span>
      </button>

      <div className="chat-tool__ws-body">
        {data.results.map((item, idx) => (
          <a
            key={idx}
            className="chat-tool__ws-card"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="chat-tool__ws-card-header">
              {item.siteIcon && (
                <img
                  className="chat-tool__ws-favicon"
                  src={item.siteIcon}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span className="chat-tool__ws-card-title">{item.title}</span>
            </div>

            {item.summary && (
              <p className="chat-tool__ws-card-summary">{item.summary}</p>
            )}

            <div className="chat-tool__ws-card-footer">
              {item.siteName && (
                <span className="chat-tool__ws-card-site">
                  {item.siteName}
                </span>
              )}
              {item.dateLastCrawled && (
                <span className="chat-tool__ws-card-date">
                  {formatDate(item.dateLastCrawled)}
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default WebSearchOutput;
