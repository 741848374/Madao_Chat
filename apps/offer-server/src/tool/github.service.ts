import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

@Injectable()
export class GithubService {
  private readonly userAgent: string;
  private readonly authHeader: string | undefined;

  readonly repoDetailTool: ReturnType<typeof tool>;
  readonly userReposTool: ReturnType<typeof tool>;

  constructor(private readonly config: ConfigService) {
    this.userAgent =
      this.config.get<string>('GITHUB_USER_AGENT')?.trim() || 'offer-server';
    const token = this.config.get<string>('GITHUB_TOKEN')?.trim();
    this.authHeader = token ? `Bearer ${token}` : undefined;

    const repoSchema = z.object({
      owner: z
        .string()
        .optional()
        .describe('仓库所属用户/组织名，与 repo 配合使用'),
      repo: z.string().optional().describe('仓库名称，与 owner 配合使用'),
      repoFullName: z
        .string()
        .optional()
        .describe('仓库全名，格式为 owner/repo，例如 facebook/react'),
    });

    this.repoDetailTool = tool(
      async (params: z.infer<typeof repoSchema>) => {
        let owner: string;
        let repo: string;
        if (params.repoFullName) {
          const parts = params.repoFullName.split('/');
          if (parts.length < 2) {
            return { content: 'repoFullName 格式错误，应为 owner/repo' };
          }
          owner = parts[0];
          repo = parts[1];
        } else if (params.owner && params.repo) {
          owner = params.owner;
          repo = params.repo;
        } else {
          return {
            content:
              '请提供 repoFullName（如 owner/repo）或同时提供 owner 和 repo',
          };
        }

        const metaRes = await this.githubFetch(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        );
        if (metaRes.status === 404) {
          return { content: `仓库 ${owner}/${repo} 不存在` };
        }
        if (!metaRes.ok) {
          const body = await metaRes.text();
          return {
            content: `GitHub 查询仓库失败 HTTP ${metaRes.status}: ${body}`,
          };
        }
        const meta = (await metaRes.json()) as {
          full_name: string;
          description: string | null;
          html_url: string;
          homepage: string | null;
          topics: string[];
          language: string | null;
          stargazers_count: number;
          forks_count: number;
          open_issues_count: number;
          default_branch: string;
          license: { spdx_id: string } | null;
          created_at: string;
          updated_at: string;
          pushed_at: string;
          private: boolean;
        };

        const readme = await this.getReadmeText(owner, repo);

        return {
          content: JSON.stringify({
            full_name: meta.full_name,
            description: meta.description,
            html_url: meta.html_url,
            homepage: meta.homepage,
            topics: meta.topics,
            language: meta.language,
            stargazers_count: meta.stargazers_count,
            forks_count: meta.forks_count,
            open_issues_count: meta.open_issues_count,
            default_branch: meta.default_branch,
            license: meta.license?.spdx_id ?? null,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            pushed_at: meta.pushed_at,
            readme:
              readme && readme.length > 8000
                ? readme.slice(0, 8000) + '\n\n...(内容已截断)'
                : readme,
          }),
        };
      },
      {
        name: 'github_repo_detail',
        description:
          '查询 GitHub 指定仓库的详细信息，包括元数据（星数、语言、描述、主题等）和 README 文档。支持 owner/repo 或分别传入 owner 和 repo 两种方式',
        schema: repoSchema,
      },
    );

    const userReposSchema = z.object({
      username: z.string().describe('GitHub 用户名'),
      maxRepos: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe('最多返回的仓库数量，默认 10'),
    });

    this.userReposTool = tool(
      async ({ username, maxRepos }: z.infer<typeof userReposSchema>) => {
        const repos = await this.listPublicRepos(username, maxRepos ?? 10);

        return {
          content: JSON.stringify({
            homepage: `https://github.com/${username}`,
            repoCount: repos.length,
            repos,
          }),
        };
      },
      {
        name: 'github_user_repos',
        description:
          '查询 GitHub 用户的公开仓库列表，返回用户主页链接和仓库列表（含仓库名、描述、语言、主题等信息）',
        schema: userReposSchema,
      },
    );
  }

  private async githubFetch(path: string, accept?: string): Promise<Response> {
    const url = path.startsWith('http')
      ? path
      : `https://api.github.com${path}`;
    const headers: Record<string, string> = {
      Accept: accept ?? 'application/vnd.github+json',
      'User-Agent': this.userAgent,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.authHeader) headers.Authorization = this.authHeader;

    const res = await fetch(url, { headers });
    return res;
  }

  async listPublicRepos(
    username: string,
    maxRepos: number,
  ): Promise<
    Array<{
      full_name: string;
      description: string | null;
      html_url: string;
      topics: string[];
      language: string | null;
      pushed_at: string | null;
    }>
  > {
    const trimmed = username.trim();
    if (!trimmed) return [];
    const perPage = Math.min(maxRepos, 100);
    const res = await this.githubFetch(
      `/users/${encodeURIComponent(trimmed)}/repos?type=owner&sort=updated&per_page=${perPage}`,
    );
    if (res.status === 404) return [];
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub 列出仓库失败 HTTP ${res.status}: ${body}`);
    }
    const data = (await res.json()) as Array<{
      full_name: string;
      description: string | null;
      html_url: string;
      topics?: string[];
      language: string | null;
      pushed_at: string | null;
      private: boolean;
    }>;
    return data
      .filter((r) => !r.private)
      .slice(0, maxRepos)
      .map((r) => ({
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        topics: r.topics ?? [],
        language: r.language,
        pushed_at: r.pushed_at,
      }));
  }

  async getReadmeText(owner: string, repo: string): Promise<string | null> {
    const res = await this.githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      'application/vnd.github.raw',
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub 读取 README 失败 HTTP ${res.status}: ${body}`);
    }
    return res.text();
  }
}
