import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  refreshToken as apiRefreshToken,
  type UserInfo,
  type LoginRequest,
} from "../api/interfaces";

interface AuthState {
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<UserInfo>) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const STORAGE_KEY = "madao_auth";
const THREAD_ID_KEY = "madao_thread_id";

function loadFromStorage(): Pick<
  AuthState,
  "user" | "accessToken" | "refreshToken"
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null };
    return JSON.parse(raw);
  } catch {
    return { user: null, accessToken: null, refreshToken: null };
  }
}

function saveToStorage(
  user: UserInfo,
  accessToken: string,
  refreshToken: string,
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ user, accessToken, refreshToken }),
  );
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const stored = loadFromStorage();
      if (stored.user && stored.accessToken && stored.refreshToken) {
        setUser(stored.user);
        setAccessToken(stored.accessToken);
        setRefreshToken(stored.refreshToken);

        try {
          const res = await apiRefreshToken(stored.refreshToken);
          if (res.data.code === 200) {
            setAccessToken(res.data.access_token);
            setRefreshToken(res.data.refresh_token);
            const updatedUser = {
              ...stored.user,
              inviteCode: res.data.inviteCode ?? stored.user.inviteCode ?? null,
            };
            setUser(updatedUser);
            saveToStorage(
              updatedUser,
              res.data.access_token,
              res.data.refresh_token,
            );
          }
        } catch {
          // refresh failed, keep stored data (will be rejected by server on next request)
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const handleForceLogout = () => {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      clearStorage();
      localStorage.removeItem(THREAD_ID_KEY);
    };
    window.addEventListener("auth:logout", handleForceLogout);
    return () => window.removeEventListener("auth:logout", handleForceLogout);
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    console.log("[Auth] 开始登录:", data.username);
    const res = await apiLogin(data);
    const { userInfo, accessToken: at, refreshToken: rt } = res.data;
    console.log("[Auth] 登录成功:", userInfo.username, "tokens:", !!at, !!rt);

    setUser(userInfo);
    setAccessToken(at);
    setRefreshToken(rt);
    saveToStorage(userInfo, at, rt);

    console.log(
      "[Auth] 状态已更新, localStorage:",
      !!localStorage.getItem(STORAGE_KEY),
    );
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    clearStorage();
    localStorage.removeItem(THREAD_ID_KEY);
  }, []);

  const updateUser = useCallback(
    (partial: Partial<UserInfo>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...partial };
        const at = accessToken;
        const rt = refreshToken;
        if (at && rt) saveToStorage(updated, at, rt);
        return updated;
      });
    },
    [accessToken, refreshToken],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      accessToken,
      refreshToken,
      loading,
      login,
      logout,
      updateUser,
    }),
    [user, accessToken, refreshToken, loading, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
