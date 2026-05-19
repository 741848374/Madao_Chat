import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  register as apiRegister,
  sendCaptcha,
  type RegisterResponse,
} from "../../api/interfaces";
import "../auth.css";

interface FieldError {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  captcha: string;
}

function validate(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
  captcha: string,
): FieldError {
  const err: FieldError = {
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    captcha: "",
  };
  if (!username.trim()) err.username = "请输入用户名";
  if (!email.trim()) err.email = "请输入邮箱";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    err.email = "邮箱格式不正确";
  if (!password) err.password = "请输入密码";
  else if (password.length < 6) err.password = "密码长度不能少于6位";
  if (!confirmPassword) err.confirmPassword = "请确认密码";
  else if (password && confirmPassword !== password)
    err.confirmPassword = "两次输入的密码不一致";
  if (!captcha.trim()) err.captcha = "请输入验证码";
  return err;
}

const Register = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    captcha: "",
  });
  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    confirmPassword: false,
    captcha: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [captchaSending, setCaptchaSending] = useState(false);
  const [captchaCooldown, setCaptchaCooldown] = useState(0);
  const [inviteModal, setInviteModal] = useState<RegisterResponse | null>(null);

  useEffect(() => {
    if (Object.values(touched).some(Boolean)) {
      setFieldErrors(
        validate(username, email, password, confirmPassword, captcha),
      );
    }
  }, [username, email, password, confirmPassword, captcha, touched]);

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSendCaptcha = async () => {
    if (!email.trim()) {
      setGlobalError("请先输入邮箱地址");
      return;
    }
    setGlobalError("");
    setCaptchaSending(true);
    try {
      await sendCaptcha(email.trim());
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
      setGlobalError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setCaptchaSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
      captcha: true,
    });

    const errors = validate(
      username,
      email,
      password,
      confirmPassword,
      captcha,
    );
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const res = await apiRegister({
        username: username.trim(),
        password,
        email: email.trim(),
        captcha: captcha.trim(),
      });
      setInviteModal(res.data);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "注册失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setInviteModal(null);
    navigate("/login", { replace: true });
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <h1 className="auth__title">MADAO CHAT</h1>
          <p className="auth__subtitle">创建新账户</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          {globalError && (
            <div className="auth__error" role="alert">
              <span className="auth__error-icon">!</span>
              <span className="auth__error-text">{globalError}</span>
            </div>
          )}

          <div className="auth__field">
            <label className="auth__label" htmlFor="register-username">
              用户名
            </label>
            <input
              id="register-username"
              className={`auth__input${fieldErrors.username && touched.username ? " auth__input--error" : ""}`}
              type="text"
              placeholder="输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => handleBlur("username")}
              autoComplete="username"
            />
            {fieldErrors.username && touched.username && (
              <span className="auth__field-error">{fieldErrors.username}</span>
            )}
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="register-email">
              邮箱
            </label>
            <input
              id="register-email"
              className={`auth__input${fieldErrors.email && touched.email ? " auth__input--error" : ""}`}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur("email")}
              autoComplete="email"
            />
            {fieldErrors.email && touched.email && (
              <span className="auth__field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="register-password">
              密码
            </label>
            <input
              id="register-password"
              className={`auth__input${fieldErrors.password && touched.password ? " auth__input--error" : ""}`}
              type="password"
              placeholder="至少 6 位密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              autoComplete="new-password"
            />
            {fieldErrors.password && touched.password && (
              <span className="auth__field-error">{fieldErrors.password}</span>
            )}
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="register-confirm">
              确认密码
            </label>
            <input
              id="register-confirm"
              className={`auth__input${fieldErrors.confirmPassword && touched.confirmPassword ? " auth__input--error" : ""}`}
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && touched.confirmPassword && (
              <span className="auth__field-error">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="register-captcha">
              验证码
            </label>
            <div className="auth__captcha-row">
              <input
                id="register-captcha"
                className={`auth__input auth__captcha-input${fieldErrors.captcha && touched.captcha ? " auth__input--error" : ""}`}
                type="text"
                placeholder="输入验证码"
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                onBlur={() => handleBlur("captcha")}
                autoComplete="one-time-code"
              />
              <button
                type="button"
                className="auth__captcha-btn"
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
            {fieldErrors.captcha && touched.captcha && (
              <span className="auth__field-error">{fieldErrors.captcha}</span>
            )}
          </div>

          <button className="auth__submit" type="submit" disabled={submitting}>
            {submitting ? "注册中…" : "→ 注册"}
          </button>
        </form>

        <div className="auth__divider">
          <span className="auth__divider-text">或者</span>
        </div>

        <div className="auth__footer">
          <Link className="auth__link" to="/login">
            已有账户？立即登录
          </Link>
        </div>
      </div>

      {inviteModal && (
        <div className="auth__overlay" onClick={handleCloseModal}>
          <div className="auth__modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth__modal-icon">✓</div>
            <h2 className="auth__modal-title">{inviteModal.message}</h2>
            <p className="auth__modal-desc">
              您的专属面试邀请码已生成，请妥善保管：
            </p>
            <div className="auth__modal-code">{inviteModal.inviteCode}</div>
            <p className="auth__modal-hint">后续将凭此邀请码进入面试环节</p>
            <button className="auth__submit" onClick={handleCloseModal}>
              知道了，去登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
