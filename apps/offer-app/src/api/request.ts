import axios from "axios";
import { refreshToken as apiRefreshToken } from "./interfaces";

const STORAGE_KEY = "madao_auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

const instance = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: {},
});

function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { accessToken } = JSON.parse(raw);
    return accessToken || null;
  } catch {
    return null;
  }
}

function getStoredRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { refreshToken } = JSON.parse(raw);
    return refreshToken || null;
  } catch {
    return null;
  }
}

function saveTokens(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    stored.accessToken = accessToken;
    stored.refreshToken = refreshToken;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}> = [];

function processRefreshQueue(error: Error | null, token?: string) {
  refreshQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  refreshQueue = [];
}

instance.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === "object" && "code" in body && "data" in body) {
      res.data = body.data;
    }
    return res;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(instance(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        const storedRefreshToken = getStoredRefreshToken();
        if (!storedRefreshToken) {
          throw new Error("无 refresh token");
        }

        const res = await apiRefreshToken(storedRefreshToken);
        if (res.data.code !== 200) {
          throw new Error(res.data.msg || "刷新失败");
        }

        const { access_token, refresh_token } = res.data;
        saveTokens(access_token, refresh_token);
        processRefreshQueue(null, access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return instance(originalRequest);
      } catch (refreshError) {
        const err =
          refreshError instanceof Error
            ? refreshError
            : new Error("token 刷新失败");
        processRefreshQueue(err);
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new Event("auth:logout"));
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    const rawMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "请求失败";
    const msg = Array.isArray(rawMsg) ? rawMsg.join("；") : rawMsg;
    return Promise.reject(new Error(msg));
  },
);

export default instance;
