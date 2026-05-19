import { useEffect, useState } from "react";
import {
  getIngestedReposByInvite,
  type IngestedRepo,
} from "../../../api/interfaces";
import "./index.css";

interface Props {
  inviteCode: string;
  selectedRepo: IngestedRepo | null;
  onSelectRepo: (repo: IngestedRepo) => void;
}

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

const GithubProjectPanel = ({
  inviteCode,
  selectedRepo,
  onSelectRepo,
}: Props) => {
  const [repos, setRepos] = useState<IngestedRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getIngestedReposByInvite(inviteCode)
      .then((res) => {
        if (!cancelled) setRepos(res.data.repos);
      })
      .catch(() => {
        if (!cancelled) setRepos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  if (loading) {
    return (
      <aside className="github-panel">
        <div className="github-panel__loading">加载中…</div>
      </aside>
    );
  }

  if (repos.length === 0) {
    return (
      <aside className="github-panel">
        <div className="github-panel__empty">暂无项目</div>
      </aside>
    );
  }

  const isSelected = (repo: IngestedRepo) => selectedRepo?.repo === repo.repo;

  return (
    <aside className="github-panel">
      <div className="github-panel__list">
        {repos.map((r) => (
          <article
            key={r.repo}
            className={`github-panel__card${isSelected(r) ? " github-panel__card--selected" : ""}`}
            onClick={() => onSelectRepo(r)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectRepo(r);
              }
            }}
          >
            <div className="github-panel__card-top">
              <span className="github-panel__card-icon">
                {getLangIcon(r.language)}
              </span>
              <span className="github-panel__card-name">{r.repo}</span>
            </div>

            {r.description && (
              <p className="github-panel__card-desc">{r.description}</p>
            )}

            <div className="github-panel__card-meta">
              {r.language && (
                <span className="github-panel__card-lang">{r.language}</span>
              )}
              {r.topics.length > 0 && (
                <span className="github-panel__card-topics">
                  {r.topics.join(" · ")}
                </span>
              )}
            </div>

            <a
              href={r.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="github-panel__card-link"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 1h5v5M13 1L7 7M3 1H2a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V9" />
              </svg>
              GitHub
            </a>
          </article>
        ))}
      </div>
    </aside>
  );
};

export default GithubProjectPanel;
