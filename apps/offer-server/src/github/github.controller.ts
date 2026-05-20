import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Param,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubService } from '../tool/github.service';
import { MilvusService } from '../tool/milvus.service';
import { RequireLogin, UserInfo } from '../server.decorator';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GithubKnowledge } from './entities/github-knowledge.entity';
import { User } from '../auth/entities/User.entity';

@Controller('github')
@RequireLogin()
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly milvusService: MilvusService,
    @InjectRepository(GithubKnowledge)
    private readonly githubKnowledgeRepo: Repository<GithubKnowledge>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Post('repos')
  async listRepos(@Body() body: { username?: string; maxRepos?: number }) {
    const username = body?.username?.trim();
    if (!username) {
      throw new BadRequestException('需要 JSON 字段 username');
    }
    const maxRepos = Math.min(Math.max(Number(body?.maxRepos) || 15, 1), 50);
    const repos = await this.githubService.listPublicRepos(username, maxRepos);
    return { username, count: repos.length, repos };
  }

  @Get('ingest/by-invite/:inviteCode')
  async listIngestedByInvite(@Param('inviteCode') inviteCode: string) {
    const owner = await this.userRepo.findOne({
      where: { inviteCode },
      select: ['id'],
    });
    if (!owner) {
      return { userId: null, count: 0, repos: [] };
    }
    const records = await this.githubKnowledgeRepo.find({
      where: { userId: owner.id },
      select: [
        'repo',
        'description',
        'language',
        'topics',
        'html_url',
        'chunkCount',
        'uploadTime',
      ],
      order: { uploadTime: 'DESC' },
    });
    return {
      userId: owner.id,
      count: records.length,
      repos: records.map((r) => ({
        repo: r.repo,
        description: r.description,
        language: r.language,
        topics: r.topics ? JSON.parse(r.topics) : [],
        html_url: r.html_url,
        chunkCount: r.chunkCount,
        uploadTime: r.uploadTime,
      })),
    };
  }

  @Get('ingest')
  async listIngested(@UserInfo() user: any) {
    const records = await this.githubKnowledgeRepo.find({
      where: { userId: user.UserId },
      select: [
        'repo',
        'description',
        'language',
        'topics',
        'html_url',
        'chunkCount',
        'uploadTime',
      ],
      order: { uploadTime: 'DESC' },
    });
    return {
      userId: user.UserId,
      count: records.length,
      repos: records.map((r) => ({
        repo: r.repo,
        description: r.description,
        language: r.language,
        topics: r.topics ? JSON.parse(r.topics) : [],
        html_url: r.html_url,
        chunkCount: r.chunkCount,
        uploadTime: r.uploadTime,
      })),
    };
  }

  @Post('ingest')
  async ingestGithub(
    @Body() body: { username?: string; maxRepos?: number },
    @UserInfo() user: any,
  ) {
    const username = body?.username?.trim();
    if (!username) {
      throw new BadRequestException('需要 JSON 字段 username');
    }
    const maxRepos = Math.min(Math.max(Number(body?.maxRepos) || 15, 1), 50);
    const repos = await this.githubService.listPublicRepos(username, maxRepos);

    if (!repos.length) {
      return { username, reposIndexed: 0, repos: [] };
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '。', '.', '；', ';', '，', ',', ' ', ''],
    });

    const allDocuments: Document[] = [];
    const records: any[] = [];
    const indexed: string[] = [];

    for (const r of repos) {
      const [owner, repo] = r.full_name.split('/');

      let readme = '';
      try {
        readme = (await this.githubService.getReadmeText(owner, repo)) ?? '';
      } catch {
        readme = '';
      }

      const header = [
        `仓库: ${r.full_name}`,
        r.description ? `描述: ${r.description}` : '',
        r.language ? `主要语言: ${r.language}` : '',
        r.topics?.length ? `标签: ${r.topics.join(', ')}` : '',
        `链接: ${r.html_url}`,
      ]
        .filter(Boolean)
        .join('\n');

      const doc = `${header}\n\n--- README ---\n\n${readme}`.trim();
      if (!doc) continue;

      const documents = await splitter.splitDocuments([
        new Document({
          pageContent: doc,
          metadata: {
            kind: 'github',
            userId: String(user.UserId),
            username: user.username || username,
            source: 'github',
            section: '',
            repo: r.full_name,
          },
        }),
      ]);

      allDocuments.push(...documents);
      records.push({
        userId: user.UserId,
        username,
        repo: r.full_name,
        description: r.description ?? undefined,
        language: r.language ?? undefined,
        topics: r.topics?.length ? JSON.stringify(r.topics) : undefined,
        html_url: r.html_url,
        readme,
        chunkCount: documents.length,
      });
      indexed.push(r.full_name);
    }

    if (allDocuments.length === 0) {
      return { username, reposIndexed: 0, repos: [] };
    }

    for (const repoFullName of indexed) {
      const filter = `repo in ["${repoFullName}"] && userId in ["${user.UserId}"]`;
      console.log(`[GitHub] 清理旧数据: ${filter}`);
      await this.milvusService.deleteByFilter(filter);
      await this.githubKnowledgeRepo.delete({
        userId: user.UserId,
        repo: repoFullName,
      });
    }

    console.log(
      `[GitHub] 批量写入向量: ${indexed.length} 个仓库, 共 ${allDocuments.length} 个 chunks`,
    );
    await this.milvusService.milvus.addDocuments(allDocuments);

    await this.githubKnowledgeRepo.save(records);

    return {
      username,
      reposIndexed: indexed.length,
      repos: indexed,
    };
  }

  @Delete('ingest/:owner/:name')
  async deleteGithubKnowledge(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @UserInfo() user: any,
  ) {
    const fullName = `${decodeURIComponent(owner)}/${decodeURIComponent(name)}`;
    if (!fullName) {
      throw new BadRequestException('需要指定仓库名 owner/repo');
    }

    await this.milvusService.deleteByFilter(
      `kind in ["github"] && repo in ["${fullName}"] && userId in ["${user.UserId}"]`,
    );
    await this.githubKnowledgeRepo.delete({
      userId: user.UserId,
      repo: fullName,
    });

    return { success: true, message: `已删除 ${fullName} 的向量和记录` };
  }
}
