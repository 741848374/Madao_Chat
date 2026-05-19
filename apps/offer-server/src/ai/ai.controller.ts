import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AiService, ResumeSection } from './ai.service';
import {
  pipeUIMessageStreamToResponse,
  UIMessage,
  createUIMessageStreamResponse,
  createUIMessageStream,
  streamText,
} from 'ai';
import { GraphService } from './langgraph/graph.service';
import type { Response } from 'express';
import { from, map } from 'rxjs';
import { toUIMessageStream } from '@ai-sdk/langchain';
import { RequireLogin, UserInfo } from 'src/server.decorator';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentLoadService } from 'src/tool/documentLoad.service';
import { MilvusService } from 'src/tool/milvus.service';
import { UploadFileService } from './upload-file.service';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AI_TTS_STREAM_EVENT } from '../common/stream-event';

@Controller('ai')
export class AiController {
  constructor(
    private aiService: AiService,
    private graphService: GraphService,
    private configService: ConfigService,
    private documentLoadService: DocumentLoadService,
    private milvusService: MilvusService,
    private uploadFileService: UploadFileService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('agui/stream')
  async rag(
    @Body()
    body: {
      messages: UIMessage[];
      threadId?: string;
      resume?: string;
      ttsSessionId?: string;
    },
    @Res({ passthrough: false }) res: Response,
    @UserInfo('username') username: string,
  ) {
    if (!body?.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('Invalid JSON');
    }

    if (body.ttsSessionId) {
      const lastHuman = [...body.messages]
        .reverse()
        .find((m) => m.role === 'user');
      const query =
        lastHuman?.parts?.find((p) => p.type === 'text')?.text ?? '';
      console.log(
        `[TTS] emit start | sessionId=${body.ttsSessionId.slice(0, 8)} | queryLen=${query.length}`,
      );
      this.eventEmitter.emit(AI_TTS_STREAM_EVENT, {
        type: 'start',
        sessionId: body.ttsSessionId,
        query,
      });
    }

    try {
      const result = await this.graphService.run({
        messages: body.messages,
        username: username ?? '',
        threadId: body.threadId,
        resume: body.resume,
        ttsSessionId: body.ttsSessionId,
      });
      console.log('[rag result][接口]', body);

      res.setHeader('X-Thread-Id', result.threadId);
      const uiStream = pipeUIMessageStreamToResponse({
        response: res,
        stream: result.stream,
      });
      return uiStream;
    } catch (error) {
      console.error('[rag error][接口]', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Stream initialization failed',
          message: (error as Error).message || 'Unknown error',
        });
      } else {
        res.end();
      }
    }
  }

  @Get('memory/:threadId')
  async getMemory(@Param('threadId') threadId: string) {
    return this.graphService.getMemory(threadId);
  }

  @Get('invite-code/check')
  async checkInviteCode(@UserInfo('username') username: string) {
    return this.graphService.checkInviteCode(username ?? '');
  }

  @Get('upload/list')
  @RequireLogin()
  async listUploadedFiles(@UserInfo() user: any) {
    const files = await this.uploadFileService.findByUserId(user.UserId);
    return {
      success: true,
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        fileType: f.fileType,
        sectionCount: f.sectionCount,
        chunkCount: f.chunkCount,
        uploadTime: f.uploadTime,
      })),
    };
  }

  @Get('upload/preview/:id')
  @RequireLogin()
  async previewUploadedFile(
    @Param('id') id: number,
    @UserInfo() user: any,
    @Res() res: Response,
  ) {
    const record = await this.uploadFileService.findFilePathById(id);
    if (!record || record.userId !== user.UserId) {
      throw new BadRequestException('文件记录不存在');
    }

    if (!record.filePath || !fs.existsSync(record.filePath)) {
      throw new BadRequestException('文件不存在');
    }

    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.md': 'text/markdown; charset=utf-8',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const ext = record.fileType || '';
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );

    const stream = fs.createReadStream(record.filePath);
    stream.pipe(res);
  }

  @Delete('upload/:id')
  @RequireLogin()
  async deleteUploadedFile(@Param('id') id: number, @UserInfo() user: any) {
    const record = await this.uploadFileService.delete(id, user.UserId);
    if (!record) {
      throw new BadRequestException('文件记录不存在');
    }

    if (record.filePath && fs.existsSync(record.filePath)) {
      fs.unlinkSync(record.filePath);
    }

    await this.milvusService.deleteByFilter(
      `kind in ["resume"] && userId in ["${user.UserId}"]`,
    );

    return { success: true, message: '删除成功' };
  }

  @Post('upload/document')
  @RequireLogin()
  @UseInterceptors(
    FileInterceptor('document', {
      storage: diskStorage({
        destination: path.join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const allowedExts = ['.md', '.pdf', '.doc', '.docx'];
        if (allowedExts.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              '仅支持 md、pdf、doc、docx 格式的文件',
            ) as any,
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadDocument(@UploadedFile() document: Express.Multer.File) {
    if (!document) {
      throw new BadRequestException('请上传文件');
    }

    document.originalname = Buffer.from(
      document.originalname,
      'latin1',
    ).toString('utf8');

    const ext = extname(document.originalname).toLowerCase();

    try {
      const docs = await this.documentLoadService.loadDocument(
        document.path,
        ext,
      );

      return {
        success: true,
        message: '上传成功',
        filename: document.originalname,
        fileType: ext,
        contentLength: docs.length,
        documents: docs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            filename: document.originalname,
            fileType: ext,
            uploadTime: new Date().toISOString(),
          },
        })),
      };
    } catch (error) {
      throw new BadRequestException(
        `文件解析失败: ${error.message || '未知错误'}`,
      );
    } finally {
      if (fs.existsSync(document.path)) {
        fs.unlinkSync(document.path);
      }
    }
  }

  @Post('upload/resume')
  @RequireLogin()
  @UseInterceptors(
    FileInterceptor('document', {
      storage: diskStorage({
        destination: path.join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const allowedExts = ['.md', '.pdf', '.doc', '.docx'];
        if (allowedExts.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              '仅支持 md、pdf、doc、docx 格式的文件',
            ) as any,
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadResume(
    @UploadedFile() document: Express.Multer.File,
    @UserInfo() user: any,
    @Res() res: Response,
  ) {
    if (!document) {
      res
        .status(400)
        .json({ message: '请上传文件', error: 'Bad Request', statusCode: 400 });
      return;
    }
    if (!user) {
      res.status(400).json({
        message: '用户信息缺失',
        error: 'Bad Request',
        statusCode: 400,
      });
      return;
    }

    document.originalname = Buffer.from(
      document.originalname,
      'latin1',
    ).toString('utf8');

    const ext = extname(document.originalname).toLowerCase();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const existing = await this.uploadFileService.findByUserAndFilename(
        user.UserId,
        document.originalname,
      );
      if (existing) {
        emit('error', {
          message: `文件 "${document.originalname}" 已上传过，请勿重复上传`,
        });
        res.end();
        return;
      }

      emit('progress', {
        step: 1,
        label: '解析内容',
        detail: '正在读取文件内容…',
      });

      const sections: ResumeSection[] = await this.aiService.splitResume(
        document.path,
        ext,
      );

      emit('progress', {
        step: 2,
        label: 'AI 分割',
        detail: 'AI 正在智能分割简历结构…',
      });

      const documents = this.buildDocuments(sections, {
        userId: String(user.UserId),
        username: user.username || 'unknown',
      });

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
        separators: [
          '\n\n',
          '\n',
          '。',
          '.',
          '；',
          ';',
          '！',
          '!',
          '？',
          '?',
          '，',
          ',',
          ' ',
          '',
        ],
      });
      const chunks = await splitter.splitDocuments(documents);

      emit('progress', {
        step: 3,
        label: '向量存储',
        detail: '正在将分割结果向量化存储…',
      });

      await this.milvusService.milvus.addDocuments(chunks);

      const saved = await this.uploadFileService.save({
        userId: user.UserId,
        username: user.username || 'unknown',
        filename: document.originalname,
        fileType: ext,
        sectionCount: sections.length,
        chunkCount: chunks.length,
        filePath: document.path,
      });

      await this.uploadFileService.updateContent(
        saved.id,
        JSON.stringify(sections),
      );

      emit('done', {
        id: saved.id,
        success: true,
        message: '简历上传并向量化成功',
        filename: document.originalname,
        fileType: ext,
        sectionCount: sections.length,
        chunkCount: chunks.length,
        sections: sections.map((s) => ({
          section: s.section,
          preview: s.content.slice(0, 100),
        })),
      });
    } catch (error) {
      emit('error', {
        message: `简历处理失败: ${(error as Error).message || '未知错误'}`,
      });
    } finally {
      res.end();
    }
  }

  private buildDocuments(
    sections: ResumeSection[],
    userMeta: {
      userId: string;
      username: string;
    },
  ): Document[] {
    return sections.map(
      (section) =>
        new Document({
          pageContent: `## ${section.section}\n\n${section.content}`,
          metadata: {
            kind: 'resume',
            userId: userMeta.userId,
            username: userMeta.username,
            source: 'resume_upload',
            section: section.section,
            repo: '',
          },
        }),
    );
  }
}
