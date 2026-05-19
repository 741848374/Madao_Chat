import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type DragEvent,
} from "react";
import {
  uploadResumeWithProgress,
  getUploadedFiles,
  deleteUploadedFile,
  type ProgressStep,
  type UploadResumeResponse,
  type UploadedFileRecord,
} from "../../api/interfaces";
import request from "../../api/request";
import "./index.css";

interface Props {
  onClose: () => void;
}

const ALLOWED_EXTS = [".md", ".pdf", ".doc", ".docx"];
const ALLOWED_EXTS_DISPLAY = ".md .pdf .doc .docx";
const MAX_SIZE = 10 * 1024 * 1024;

const FILE_ICONS: Record<string, string> = {
  ".md": "📝",
  ".pdf": "📄",
  ".docx": "📃",
  ".doc": "📃",
};

interface FileValidation {
  valid: boolean;
  error?: string;
}

function validateFile(file: File): FileValidation {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return { valid: false, error: "仅支持 md、pdf、doc、docx 格式" };
  }
  if (file.size > MAX_SIZE) {
    return { valid: false, error: "文件大小不能超过 10MB" };
  }
  return { valid: true };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

const UploadResumeModal = ({ onClose }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<FileValidation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showingPreview, setShowingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRecord[]>([]);
  const [progressStep, setProgressStep] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [stepDetail, setStepDetail] = useState("正在上传文件到服务器…");
  const [activePreviewId, setActivePreviewId] = useState<number | null>(null);
  const [listFullscreen, setListFullscreen] = useState(false);
  const [listPreviewUrl, setListPreviewUrl] = useState("");
  const [listPreviewLoading, setListPreviewLoading] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const handleListPreview = async (id: number) => {
    if (activePreviewId === id) {
      setActivePreviewId(null);
      if (listPreviewUrl) {
        URL.revokeObjectURL(listPreviewUrl);
        setListPreviewUrl("");
      }
      return;
    }

    if (listPreviewUrl) {
      URL.revokeObjectURL(listPreviewUrl);
      setListPreviewUrl("");
    }

    setActivePreviewId(id);
    setListPreviewLoading(true);

    try {
      const res = await request.get(`/ai/upload/preview/${id}`, {
        responseType: "blob",
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      setListPreviewUrl(url);
    } catch {
      setActivePreviewId(null);
    } finally {
      setListPreviewLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUploadedFile(id);
      showToast("简历已删除");
      if (activePreviewId === id) {
        setActivePreviewId(null);
        if (listPreviewUrl) {
          URL.revokeObjectURL(listPreviewUrl);
          setListPreviewUrl("");
        }
      }
      setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // ignore
    }
  };

  const steps = [
    { label: "上传文件" },
    { label: "解析内容" },
    { label: "AI 分割" },
    { label: "向量存储" },
  ];

  useEffect(() => {
    getUploadedFiles()
      .then((res) => {
        setUploadedFiles(res.data.files);
      })
      .catch(() => {});
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const resetFile = useCallback(() => {
    setFile(null);
    setValidation(null);
    setShowingPreview(false);
    setPreviewUrl("");
    setPreviewText("");
    setProgressStep(0);
    setUploadPercent(0);
    setStepDetail("正在上传文件到服务器…");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (listPreviewUrl) URL.revokeObjectURL(listPreviewUrl);
    };
  }, [previewUrl, listPreviewUrl]);

  const handleFile = useCallback((file: File) => {
    setError("");
    setSuccess(false);
    setFile(file);
    setValidation(validateFile(file));
    setShowingPreview(false);
    setPreviewUrl("");
    setPreviewText("");
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    handleFile(f);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    handleFile(f);
  };

  const handleUpload = () => {
    if (!file || !validation?.valid) return;

    setError("");
    setSuccess(false);
    setUploading(true);
    setProgressStep(0);
    setUploadPercent(0);

    uploadResumeWithProgress(file, {
      onUploadPercent: (pct) => {
        setUploadPercent(pct);
        setProgressStep(0);
        setStepDetail(`正在上传文件… ${pct}%`);
      },
      onUploadDone: () => {
        setProgressStep(1);
      },
      onStep: (s: ProgressStep) => {
        setProgressStep(s.step);
        setStepDetail(s.detail);
      },
      onDone: (result: UploadResumeResponse) => {
        setProgressStep(4);
        setUploading(false);
        showToast("简历上传并向量化成功 ✓");
        setSuccess(true);
        setUploadedFiles((prev) => [
          ...prev,
          {
            id: result.id,
            filename: result.filename,
            fileType: result.fileType,
            sectionCount: result.sectionCount,
            chunkCount: result.chunkCount,
            uploadTime: new Date().toISOString(),
          },
        ]);
        resetFile();
      },
      onError: (msg: string) => {
        setError(msg);
        showToast(msg, "error");
        setUploading(false);
      },
    });
  };

  const handleAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleTogglePreview = async () => {
    const ext = file ? "." + file.name.split(".").pop()?.toLowerCase() : "";
    if (!file || !ext) return;

    if (showingPreview) {
      setShowingPreview(false);
      return;
    }

    setShowingPreview(true);

    if (ext === ".pdf") {
      if (!previewUrl) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    } else if (ext === ".md") {
      if (!previewText) {
        setPreviewLoading(true);
        try {
          const text = await file.text();
          setPreviewText(text);
        } catch {
          setPreviewText("无法读取文件内容");
        } finally {
          setPreviewLoading(false);
        }
      }
    }
  };

  const ext = file ? "." + file.name.split(".").pop()?.toLowerCase() : "";
  const fileIcon = FILE_ICONS[ext] || "📎";

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
      <div className="modal-overlay">
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal__header">
            <h2 className="modal__title">上传简历</h2>
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
            <div
              className={`modal__drop-zone${dragOver ? " modal__drop-zone--over" : ""}${validation && !validation.valid ? " modal__drop-zone--error" : ""}${file ? " modal__drop-zone--filled" : ""}`}
              onClick={handleAreaClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="modal__file-preview">
                  <span className="modal__file-icon">{fileIcon}</span>
                  <div className="modal__file-info">
                    <span className="modal__file-name">{file.name}</span>
                    <span className="modal__file-size">
                      {formatSize(file.size)}
                    </span>
                  </div>
                  <button
                    className="modal__file-action"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePreview();
                    }}
                    title={showingPreview ? "收起预览" : "预览内容"}
                  >
                    {showingPreview ? "收起" : "预览"}
                  </button>
                  <button
                    className="modal__file-remove"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetFile();
                    }}
                    aria-label="移除文件"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="modal__drop-placeholder">
                  <span className="modal__drop-icon">📂</span>
                  <span className="modal__drop-text">
                    拖拽文件到此处，或点击选择
                  </span>
                  <span className="modal__drop-hint">
                    支持 {ALLOWED_EXTS_DISPLAY}，最大 10MB
                  </span>
                </div>
              )}
            </div>

            {showingPreview && ext === ".pdf" && previewUrl && (
              <div className="modal__preview-wrapper">
                <button
                  className="modal__preview-enlarge"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreen(true);
                  }}
                  title="放大预览"
                >
                  ⛶
                </button>
                <iframe
                  className="modal__preview-frame"
                  src={previewUrl}
                  title="文件预览"
                />
              </div>
            )}

            {showingPreview && ext === ".md" && (
              <pre className="modal__preview-text">
                {previewLoading ? "加载中…" : previewText}
              </pre>
            )}

            {showingPreview && (ext === ".docx" || ext === ".doc") && (
              <div className="modal__preview-hint">
                .doc/.docx 格式暂不支持浏览器内预览，请上传后查看
              </div>
            )}

            {validation && !validation.valid && (
              <div className="modal__validation-error">{validation.error}</div>
            )}

            {validation?.valid && (
              <div className="modal__validation-ok">
                文件格式和大小校验通过 ✓
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTS.join(",")}
              style={{ display: "none" }}
              onChange={handleInputChange}
            />

            {uploading && (
              <div className="modal__progress">
                <div className="modal__progress-steps">
                  {steps.map((step, i) => (
                    <div
                      key={step.label}
                      className={`modal__progress-step${i < progressStep ? " modal__progress-step--done" : ""}${i === progressStep ? " modal__progress-step--active" : ""}`}
                    >
                      <span className="modal__progress-dot">
                        {i < progressStep ? "✓" : i + 1}
                      </span>
                      <span className="modal__progress-label">
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="modal__progress-track">
                  <div
                    className="modal__progress-fill"
                    style={{
                      width: `${
                        progressStep === 0
                          ? (uploadPercent / 100) * 25
                          : Math.min(25 + progressStep * 25, 100)
                      }%`,
                    }}
                  />
                </div>
                <p className="modal__progress-detail">{stepDetail}</p>
              </div>
            )}

            {success && (
              <div className="modal__progress modal__progress--success">
                <div className="modal__success">
                  <span className="modal__success-title">✓ 上传成功</span>
                </div>
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div className="modal__uploaded">
                <h3 className="modal__uploaded-title">
                  已上传 ({uploadedFiles.length})
                </h3>
                <div className="modal__uploaded-list">
                  {uploadedFiles.map((uf, i) => (
                    <div key={i} className="modal__uploaded-item">
                      <span className="modal__uploaded-icon">📄</span>
                      <div className="modal__uploaded-info">
                        <span className="modal__uploaded-name">
                          {uf.filename}
                        </span>
                        <span className="modal__uploaded-meta">
                          {uf.sectionCount} 个部分 · {uf.chunkCount} 个向量块 ·{" "}
                          {new Date(uf.uploadTime).toLocaleTimeString()}
                        </span>
                      </div>
                      <button
                        className="modal__uploaded-preview-btn"
                        type="button"
                        onClick={() => handleListPreview(uf.id)}
                      >
                        {activePreviewId === uf.id ? "收起" : "预览"}
                      </button>
                      <button
                        className="modal__uploaded-delete-btn"
                        type="button"
                        onClick={() => handleDelete(uf.id)}
                        title="删除"
                      >
                        <span className="modal__uploaded-delete-text">
                          删除
                        </span>
                      </button>
                    </div>
                  ))}
                </div>

                {activePreviewId != null && (
                  <div className="modal__list-preview">
                    <div className="modal__list-preview-wrapper">
                      {listPreviewLoading && (
                        <div className="modal__list-preview-loading">
                          加载中…
                        </div>
                      )}
                      {listPreviewUrl && (
                        <>
                          <button
                            className="modal__preview-enlarge"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setListFullscreen(true);
                            }}
                            title="放大预览"
                          >
                            ⛶
                          </button>
                          <iframe
                            className="modal__list-preview-frame"
                            src={listPreviewUrl}
                            title="简历预览"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="modal__submit"
              type="button"
              disabled={uploading || !file || !validation?.valid}
              onClick={handleUpload}
            >
              {uploading ? "解析中…" : "→ 上传并智能分割"}
            </button>
          </div>
        </div>
      </div>

      {fullscreen && previewUrl && (
        <div
          className="modal__preview-fullscreen"
          onClick={() => setFullscreen(false)}
        >
          <button
            className="modal__preview-fullscreen-close"
            type="button"
            onClick={() => setFullscreen(false)}
          >
            ✕
          </button>
          <iframe
            className="modal__preview-fullscreen-frame"
            src={previewUrl}
            title="全屏预览"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {listFullscreen && listPreviewUrl && (
        <div
          className="modal__preview-fullscreen"
          onClick={() => setListFullscreen(false)}
        >
          <button
            className="modal__preview-fullscreen-close"
            type="button"
            onClick={() => setListFullscreen(false)}
          >
            ✕
          </button>
          <iframe
            className="modal__preview-fullscreen-frame"
            src={listPreviewUrl}
            title="全屏简历预览"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default UploadResumeModal;
