import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../api/interfaces";
import "../auth.css";

interface FieldError {
  username: string;
  email: string;
}

function validate(username: string, email: string): FieldError {
  const err: FieldError = { username: "", email: "" };
  if (!username.trim()) err.username = "请输入用户名";
  if (!email.trim()) err.email = "请输入注册邮箱";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) err.email = "邮箱格式不正确";
  return err;
}

const ForgotPassword = () => {
  const [step, setStep] = useState<"form" | "success">("form");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError>({ username: "", email: "" });
  const [touched, setTouched] = useState({ username: false, email: false });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (touched.username || touched.email) {
      setFieldErrors(validate(username, email));
    }
  }, [username, email, touched]);

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({ username: true, email: true });

    const errors = validate(username, email);
    setFieldErrors(errors);
    if (errors.username || errors.email) return;

    setSubmitting(true);
    try {
      await forgotPassword({
        username: username.trim(),
        email: email.trim(),
      });
      setStep("success");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "发送失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "success") {
    return (
      <div className="auth">
        <div className="auth__card">
          <div className="auth__brand">
            <h1 className="auth__title">MADAO CHAT</h1>
            <p className="auth__subtitle">密码已发送</p>
          </div>
          <p className="auth__success-msg">
            新密码已发送至您的注册邮箱，请查收后登录
          </p>
          <Link className="auth__submit" to="/login">
            → 返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <h1 className="auth__title">MADAO CHAT</h1>
          <p className="auth__subtitle">忘记密码</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          {globalError && (
            <div className="auth__error" role="alert">
              <span className="auth__error-icon">!</span>
              <span className="auth__error-text">{globalError}</span>
            </div>
          )}

          <div className="auth__field">
            <label className="auth__label" htmlFor="forgot-username">
              用户名
            </label>
            <input
              id="forgot-username"
              className={`auth__input${fieldErrors.username && touched.username ? " auth__input--error" : ""}`}
              type="text"
              placeholder="输入注册用户名"
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
            <label className="auth__label" htmlFor="forgot-email">
              注册邮箱
            </label>
            <input
              id="forgot-email"
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

          <button className="auth__submit" type="submit" disabled={submitting}>
            {submitting ? "发送中…" : "→ 发送密码至邮箱"}
          </button>
        </form>

        <div className="auth__divider">
          <span className="auth__divider-text">或者</span>
        </div>

        <div className="auth__footer">
          <Link className="auth__link" to="/login">
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
