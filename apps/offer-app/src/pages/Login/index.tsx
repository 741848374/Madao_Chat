import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../auth.css";

interface FieldError {
  username: string;
  password: string;
}

function validate(username: string, password: string): FieldError {
  const err: FieldError = { username: "", password: "" };
  if (!username.trim()) err.username = "请输入用户名";
  if (!password) err.password = "请输入密码";
  return err;
}

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError>({
    username: "",
    password: "",
  });
  const [touched, setTouched] = useState({ username: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const doNavigate = useRef(false);

  useEffect(() => {
    if (user && !doNavigate.current) {
      doNavigate.current = true;
      navigate("/chat", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (touched.username || touched.password) {
      setFieldErrors(validate(username, password));
    }
  }, [username, password, touched]);

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError("");
    setTouched({ username: true, password: true });

    const errors = validate(username, password);
    setFieldErrors(errors);
    if (errors.username || errors.password) return;

    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      setGlobalError(
        err instanceof Error ? "用户名或密码错误" : "登录失败，请重试",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <h1 className="auth__title">MADAO CHAT</h1>
          <p className="auth__subtitle">登录你的账户</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          {globalError && (
            <div className="auth__error" role="alert">
              <span className="auth__error-icon">!</span>
              <span className="auth__error-text">{globalError}</span>
            </div>
          )}

          <div className="auth__field">
            <label className="auth__label" htmlFor="login-username">
              用户名
            </label>
            <input
              id="login-username"
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
            <label className="auth__label" htmlFor="login-password">
              密码
            </label>
            <input
              id="login-password"
              className={`auth__input${fieldErrors.password && touched.password ? " auth__input--error" : ""}`}
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              autoComplete="current-password"
            />
            {fieldErrors.password && touched.password && (
              <span className="auth__field-error">{fieldErrors.password}</span>
            )}
          </div>

          <div className="auth__submit-row">
            <button
              className="auth__submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "登录中…" : "→ 登录"}
            </button>
            <Link className="auth__link auth__link--dim" to="/forgot-password">
              忘记密码？
            </Link>
          </div>
        </form>

        <div className="auth__divider">
          <span className="auth__divider-text">或者</span>
        </div>

        <div className="auth__footer">
          <Link className="auth__link" to="/register">
            没有账户？立即注册
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
