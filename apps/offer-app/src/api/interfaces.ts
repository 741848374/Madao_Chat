import request from "./request";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
  captcha: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  headPic: string;
  status: number;
  createTime: number;
  roles: string[];
  permissions: { code: string; description: string }[];
  inviteCode: string | null;
}

export interface LoginResponse {
  userInfo: UserInfo;
  accessToken: string;
  refreshToken: string;
}

export function login(data: LoginRequest) {
  return request.post<LoginResponse>("/auth/login", data);
}

export interface RegisterResponse {
  message: string;
  inviteCode: string;
}

export function register(data: RegisterRequest) {
  return request.post<RegisterResponse>("/auth/register", data);
}

export function sendCaptcha(email: string) {
  return request.get("/auth/register-captcha", {
    params: { address: email },
  });
}

export function refreshToken(refreshToken: string) {
  return request.post<{
    code: number;
    msg: string;
    access_token: string;
    refresh_token: string;
    inviteCode?: string | null;
  }>("/auth/refresh", null, {
    params: { refreshToken },
  });
}

export interface UpdateInfoRequest {
  headPic: string;
  email: string;
  captcha: string;
}

export function sendUpdateCaptcha(email: string) {
  return request.get("/auth/update-captcha", {
    params: { address: email },
  });
}

export function updateInfo(data: UpdateInfoRequest) {
  return request.post<string>("/auth/update-info", data);
}

export interface ForgotPasswordRequest {
  username: string;
  email: string;
}

export function forgotPassword(data: ForgotPasswordRequest) {
  return request.post<string>("/auth/forgot-password", data);
}

export interface ResumeChunk {
  section: string;
  preview: string;
}

export interface UploadedFileRecord {
  id: number;
  filename: string;
  fileType: string;
  sectionCount: number;
  chunkCount: number;
  uploadTime: string;
}

export interface UploadListResponse {
  success: boolean;
  files: UploadedFileRecord[];
}

export function getUploadedFiles() {
  return request.get<UploadListResponse>("/ai/upload/list");
}

export function deleteUploadedFile(id: number) {
  return request.delete<{ success: boolean; message: string }>(
    `/ai/upload/${id}`,
  );
}

export interface UploadResumeResponse {
  id: number;
  success: boolean;
  message: string;
  filename: string;
  fileType: string;
  sectionCount: number;
  chunkCount: number;
  sections: ResumeChunk[];
}

export function uploadResume(file: File) {
  const formData = new FormData();
  formData.append("document", file);
  return request.post<UploadResumeResponse>("/ai/upload/resume", formData);
}

export interface ProgressStep {
  step: number;
  label: string;
  detail: string;
}

export function uploadResumeWithProgress(
  file: File,
  callbacks: {
    onUploadPercent: (pct: number) => void;
    onUploadDone: () => void;
    onStep: (step: ProgressStep) => void;
    onDone: (result: UploadResumeResponse) => void;
    onError: (error: string) => void;
  },
) {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append("document", file);

  const token = (() => {
    try {
      const raw = localStorage.getItem("madao_auth");
      if (!raw) return null;
      return JSON.parse(raw).accessToken || null;
    } catch {
      return null;
    }
  })();

  let lastIdx = 0;
  let buffer = "";

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      callbacks.onUploadPercent(Math.round((e.loaded / e.total) * 100));
    }
  };

  xhr.upload.onloadend = () => {
    callbacks.onUploadDone();
  };

  const processBuffer = () => {
    while (true) {
      const sepIdx = buffer.indexOf("\n\n");
      if (sepIdx === -1) break;
      const block = buffer.substring(0, sepIdx);
      buffer = buffer.substring(sepIdx + 2);
      const lines = block.split("\n");
      let type = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) type = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!type || !data) continue;
      try {
        const parsed = JSON.parse(data);
        if (type === "progress") callbacks.onStep(parsed as ProgressStep);
        else if (type === "done")
          callbacks.onDone(parsed as UploadResumeResponse);
        else if (type === "error") callbacks.onError(parsed.message);
      } catch {
        /* skip malformed */
      }
    }
  };

  xhr.onprogress = () => {
    buffer += xhr.responseText.substring(lastIdx);
    lastIdx = xhr.responseText.length;
    processBuffer();
  };

  xhr.onloadend = () => {
    buffer += xhr.responseText.substring(lastIdx);
    processBuffer();
  };

  xhr.onerror = () => callbacks.onError("网络连接失败，请检查网络后重试");

  xhr.open(
    "POST",
    `${import.meta.env.VITE_API_BASE || "http://localhost:3000"}/ai/upload/resume`,
  );
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  xhr.send(formData);
}

export interface GithubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  topics: string[];
  language: string | null;
  pushed_at: string | null;
}

export interface GithubReposResponse {
  username: string;
  count: number;
  repos: GithubRepo[];
}

export interface GithubIngestResponse {
  username: string;
  reposIndexed: number;
  repos: string[];
}

export function fetchGithubRepos(username: string, maxRepos?: number) {
  return request.post<GithubReposResponse>("/github/repos", {
    username,
    maxRepos,
  });
}

export function ingestGithubRepos(username: string, maxRepos?: number) {
  return request.post<GithubIngestResponse>("/github/ingest", {
    username,
    maxRepos,
  });
}

export function deleteGithubRepo(repo: string) {
  const [owner, name] = repo.split("/");
  return request.delete<{ success: boolean; message: string }>(
    `/github/ingest/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  );
}

export interface IngestedRepo {
  repo: string;
  description: string | null;
  language: string | null;
  topics: string[];
  html_url: string;
  chunkCount: number;
  uploadTime: string;
}

export interface IngestedReposResponse {
  userId: number;
  count: number;
  repos: IngestedRepo[];
}

export function getIngestedRepos() {
  return request.get<IngestedReposResponse>("/github/ingest");
}

export function getIngestedReposByInvite(inviteCode: string) {
  return request.get<IngestedReposResponse>(
    `/github/ingest/by-invite/${encodeURIComponent(inviteCode)}`,
  );
}

export interface ChatMemoryItem {
  role: string;
  content: string;
  timestamp: number;
  type?: string;
  webSearch?: any;
}

export interface MemoryResponse {
  threadId: string;
  chatMemory: ChatMemoryItem[];
}

export function getMemory(threadId: string) {
  return request.get<MemoryResponse>(`/ai/memory/${threadId}`);
}

export interface CheckInviteCodeResponse {
  inviteCode: string | null;
  validated: boolean;
}

export function checkInviteCode() {
  return request.get<CheckInviteCodeResponse>("/ai/invite-code/check");
}

export function recognizeSpeech(audioBlob: Blob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  return request.post<string>("/speech/asr", formData);
}
