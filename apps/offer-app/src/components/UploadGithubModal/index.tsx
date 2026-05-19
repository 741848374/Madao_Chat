import { useEffect, useRef, useState } from "react";
import {
  fetchGithubRepos,
  ingestGithubRepos,
  deleteGithubRepo,
  getIngestedRepos,
  type GithubRepo,
  type IngestedRepo,
} from "../../api/interfaces";
import "./index.css";

interface Props {
  onClose: () => void;
}

function getRepoIcon(repo: GithubRepo): string {
  if (repo.language === "TypeScript" || repo.language === "JavaScript")
    return "🟦";
  if (repo.language === "Python") return "🟩";
  if (repo.language === "Java") return "🟧";
  if (repo.language === "Go") return "🟦";
  if (repo.language === "Rust") return "🟪";
  if (repo.language === "C++" || repo.language === "C") return "🟫";
  return "📁";
}

const UploadGithubModal = ({ onClose }: Props) => {
  const [username, setUsername] = useState("");
  const [maxRepos, setMaxRepos] = useState(15);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [result, setResult] = useState<{
    reposIndexed: number;
    repos: string[];
  } | null>(null);
  const [ingestedRepos, setIngestedRepos] = useState<IngestedRepo[]>([]);
  const [loadingIngested, setLoadingIngested] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const fetchIngested = async () => {
    setLoadingIngested(true);
    try {
      const res = await getIngestedRepos();
      setIngestedRepos(res.data.repos);
    } catch {
      // 静默失败，不影响主流程
    } finally {
      setLoadingIngested(false);
    }
  };

  useEffect(() => {
    fetchIngested();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleFetch = async () => {
    if (!username.trim()) {
      setError("请输入 GitHub 用户名");
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetchGithubRepos(username.trim(), maxRepos);
      setRepos(res.data.repos);
      if (res.data.repos.length === 0) {
        showToast(`未找到 ${username.trim()} 的公开仓库`, "error");
      } else {
        showToast(`找到 ${res.data.repos.length} 个仓库`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "获取仓库列表失败";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!username.trim()) return;
    setError("");
    setResult(null);
    setIngesting(true);
    try {
      const res = await ingestGithubRepos(username.trim(), maxRepos);
      setResult(res.data);
      await fetchIngested();
      showToast(`入库完成：成功 ${res.data.reposIndexed} 个`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "GitHub 仓库入库失败";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (repoName: string) => {
    try {
      await deleteGithubRepo(repoName);
      await fetchIngested();
      showToast(`已删除 ${repoName}`);
    } catch (err) {
      showToast(`删除失败`, "error");
    }
  };

  return (
    <>
      {toast && (
        <div
          className={`modal__toast${toast.type === "error" ? " modal__toast--error" : ""}`}
          role="status"
        >
          <span className="modal__toast-icon">
            {toast.type === "error" ? "⚠" : "✓"}
          </span>
          <span className="modal__toast-text">{toast.text}</span>
        </div>
      )}

      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal__header">
            <h2 className="modal__title">上传 GitHub</h2>
            <button
              className="modal__close"
              type="button"
              onClick={onClose}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="modal__error" role="alert">
              {error}
            </div>
          )}

          <div className="modal__form">
            <div className="modal__field">
              <label className="modal__label" htmlFor="github-username">
                GitHub 用户名
              </label>
              <input
                id="github-username"
                className="modal__input"
                type="text"
                placeholder="请输入 GitHub 用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetch();
                }}
              />
            </div>

            <div className="modal__field">
              <label className="modal__label" htmlFor="github-maxrepos">
                最大仓库数
              </label>
              <select
                id="github-maxrepos"
                className="modal__input"
                value={maxRepos}
                onChange={(e) => setMaxRepos(Number(e.target.value))}
              >
                <option value={5}>5 个</option>
                <option value={10}>10 个</option>
                <option value={15}>15 个</option>
              </select>
            </div>

            <button
              className="modal__submit"
              type="button"
              disabled={loading || !username.trim()}
              onClick={handleFetch}
            >
              {loading ? "查询中…" : "→ 查询仓库"}
            </button>

            {ingestedRepos.length > 0 && (
              <div
                className="github-modal__repos"
                style={{ marginTop: "var(--pixel4)" }}
              >
                <h3 className="github-modal__repos-title">
                  已存入仓库 · <span>{ingestedRepos.length}</span>
                </h3>
                <div className="github-modal__repos-list">
                  {ingestedRepos.map((r) => (
                    <div key={r.repo} className="github-modal__repo-item">
                      <span className="github-modal__repo-icon">
                        {getRepoIcon({
                          full_name: r.repo,
                          description: r.description,
                          html_url: r.html_url,
                          topics: r.topics,
                          language: r.language,
                          pushed_at: null,
                        })}
                      </span>
                      <div className="github-modal__repo-body">
                        <a
                          className="github-modal__repo-name"
                          href={r.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.repo}
                        </a>
                        {r.description && (
                          <span className="github-modal__repo-desc">
                            {r.description}
                          </span>
                        )}
                        <div className="github-modal__repo-meta">
                          {r.language && (
                            <span className="github-modal__repo-lang">
                              {r.language}
                            </span>
                          )}
                          {r.topics.length > 0 && (
                            <span className="github-modal__repo-topics">
                              {r.topics.slice(0, 4).join(" · ")}
                              {r.topics.length > 4 ? " …" : ""}
                            </span>
                          )}
                          <span className="github-modal__repo-star">
                            {r.chunkCount} chunks
                          </span>
                        </div>
                      </div>
                      <button
                        className="github-modal__delete-btn"
                        type="button"
                        onClick={() => handleDelete(r.repo)}
                        title={`删除 ${r.repo}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingIngested && ingestedRepos.length === 0 && (
              <div className="github-modal__ingested-loading">
                加载已存入仓库…
              </div>
            )}

            {repos.length > 0 && (
              <div className="github-modal__repos">
                <h3 className="github-modal__repos-title">
                  公开仓库 · <span>{repos.length}</span>
                </h3>
                <div className="github-modal__repos-list">
                  {repos.map((r) => (
                    <div key={r.full_name} className="github-modal__repo-item">
                      <span className="github-modal__repo-icon">
                        {getRepoIcon(r)}
                      </span>
                      <div className="github-modal__repo-body">
                        <a
                          className="github-modal__repo-name"
                          href={r.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.full_name}
                        </a>
                        {r.description && (
                          <span className="github-modal__repo-desc">
                            {r.description}
                          </span>
                        )}
                        <div className="github-modal__repo-meta">
                          {r.language && (
                            <span className="github-modal__repo-lang">
                              {r.language}
                            </span>
                          )}
                          {r.topics.length > 0 && (
                            <span className="github-modal__repo-topics">
                              {r.topics.slice(0, 4).join(" · ")}
                              {r.topics.length > 4 ? " …" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="github-modal__actions-row"
                  style={{ marginTop: "var(--pixel3)" }}
                >
                  <button
                    className="modal__submit github-modal__ingest-btn"
                    type="button"
                    disabled={ingesting}
                    onClick={handleIngest}
                    style={{ flex: 1, marginTop: 0 }}
                  >
                    {ingesting ? "入库中…" : "→ 提取并入库"}
                  </button>
                  <button
                    className="modal__submit modal__submit--secondary"
                    type="button"
                    disabled={ingesting}
                    onClick={() => {
                      if (result?.repos.length) {
                        result.repos.forEach((name) => handleDelete(name));
                      }
                    }}
                    style={{ flex: 1, marginTop: 0 }}
                  >
                    删除已入库
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="github-modal__result">
                <h3 className="github-modal__result-title">入库结果</h3>
                <p>
                  ✓ 成功: <strong>{result.reposIndexed}</strong> 个仓库
                </p>
                {result.repos.length > 0 && (
                  <div className="github-modal__result-list">
                    {result.repos.map((name) => (
                      <span key={name} className="github-modal__result-item">
                        ✓ {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default UploadGithubModal;
