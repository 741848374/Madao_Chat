import { type FormEvent, useState } from "react";
import {
  updateInfo as apiUpdateInfo,
  sendUpdateCaptcha,
  type UpdateInfoRequest,
} from "../../api/interfaces";
import { useAuth } from "../../context/AuthContext";
import "./index.css";

interface Props {
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  管理员: "管理员",
  普通用户: "普通用户",
};

const UpdateInfoModal = ({ onClose }: Props) => {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [headPic, setHeadPic] = useState(user?.headPic ?? "");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaSending, setCaptchaSending] = useState(false);
  const [captchaCooldown, setCaptchaCooldown] = useState(0);

  const handleSendCaptcha = async () => {
    if (!email.trim()) {
      setError("请先输入邮箱地址");
      return;
    }
    setError("");
    setCaptchaSending(true);
    try {
      await sendUpdateCaptcha(email.trim());
      setCaptchaCooldown(60);
      const timer = setInterval(() => {
        setCaptchaCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setCaptchaSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !captcha.trim()) {
      setError("请填写邮箱和验证码");
      return;
    }

    const data: UpdateInfoRequest = {
      headPic: headPic.trim(),
      email: email.trim(),
      captcha: captcha.trim(),
    };

    setSubmitting(true);
    try {
      await apiUpdateInfo(data);
      updateUser({ email: data.email, headPic: data.headPic });
      setSuccess("修改成功");
      setEditing(false);
      setCaptcha("");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEmail(user?.email ?? "");
    setHeadPic(user?.headPic ?? "");
    setCaptcha("");
    setError("");
    setSuccess("");
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="profile"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="profile__header">
          <h2 className="profile__title">个人信息</h2>
          <button
            className="profile__close"
            type="button"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="profile__body">
          {user && (
            <>
              <div className="profile__avatar-section">
                {user.headPic ? (
                  <img
                    className="profile__avatar"
                    src={user.headPic}
                    alt={user.username}
                  />
                ) : (
                  <div className="profile__avatar profile__avatar--placeholder">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="profile__name">{user.username}</div>
                <div className="profile__role">
                  {user.roles.map((r) => ROLE_LABELS[r] || r).join(" / ")}
                </div>
              </div>

              <div className="profile__info-grid">
                <div className="profile__info-item">
                  <span className="profile__info-label">邮箱</span>
                  <span className="profile__info-value">{user.email}</span>
                </div>
                <div className="profile__info-item">
                  <span className="profile__info-label">注册时间</span>
                  <span className="profile__info-value">
                    {formatDate(user.createTime)}
                  </span>
                </div>
                <div className="profile__info-item">
                  <span className="profile__info-label">账户状态</span>
                  <span className="profile__info-value">
                    <span
                      className={`profile__status-dot${user.status === 1 ? " profile__status-dot--active" : ""}`}
                    />
                    {user.status === 1 ? "正常" : "禁用"}
                  </span>
                </div>
                <div className="profile__info-item profile__info-item--full">
                  <span className="profile__info-label">面试邀请码</span>
                  <span className="profile__invite-code">
                    {user.inviteCode || "暂无"}
                  </span>
                </div>
              </div>

              <div className="profile__actions">
                {!editing ? (
                  <button
                    className="profile__edit-btn"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    修改信息
                  </button>
                ) : (
                  <button
                    className="profile__edit-btn profile__edit-btn--cancel"
                    type="button"
                    onClick={handleCancelEdit}
                  >
                    取消修改
                  </button>
                )}
              </div>
            </>
          )}

          {editing && (
            <form className="profile__form" onSubmit={handleSubmit}>
              <div className="profile__form-divider" />

              {error && (
                <div className="profile__form-error" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="profile__form-success" role="status">
                  {success}
                </div>
              )}

              <div className="profile__field">
                <label className="profile__label" htmlFor="update-headpic">
                  头像 URL
                </label>
                <input
                  id="update-headpic"
                  className="profile__input"
                  type="text"
                  placeholder="可选，输入头像图片地址"
                  value={headPic}
                  onChange={(e) => setHeadPic(e.target.value)}
                />
              </div>

              <div className="profile__field">
                <label className="profile__label" htmlFor="update-email">
                  邮箱
                </label>
                <input
                  id="update-email"
                  className="profile__input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="profile__field">
                <label className="profile__label" htmlFor="update-captcha">
                  验证码
                </label>
                <div className="profile__captcha-row">
                  <input
                    id="update-captcha"
                    className="profile__input profile__captcha-input"
                    type="text"
                    placeholder="输入验证码"
                    value={captcha}
                    onChange={(e) => setCaptcha(e.target.value)}
                    autoComplete="one-time-code"
                  />
                  <button
                    type="button"
                    className="profile__captcha-btn"
                    disabled={captchaCooldown > 0 || captchaSending}
                    onClick={handleSendCaptcha}
                  >
                    {captchaSending
                      ? "发送中…"
                      : captchaCooldown > 0
                        ? `${captchaCooldown}s`
                        : "获取验证码"}
                  </button>
                </div>
              </div>

              <button
                className="profile__submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "保存中…" : "→ 保存"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateInfoModal;
