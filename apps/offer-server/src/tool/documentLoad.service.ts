import { Injectable, Logger } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import * as fs from 'fs';

export interface DocumentChunk {
  pageContent: string;
  metadata: Record<string, any>;
}

@Injectable()
export class DocumentLoadService {
  private readonly logger = new Logger(DocumentLoadService.name);
  readonly tool: ReturnType<typeof tool>;

  constructor() {
    const loadToolSchema = z.object({
      filePath: z.string().describe('要加载的文件路径'),
      fileType: z.enum(['.md', '.pdf', '.docx', '.doc']).describe('文件类型'),
    });

    this.tool = tool(
      async ({ filePath, fileType }) => {
        const docs = await this.loadDocument(filePath, fileType);
        return {
          content: JSON.stringify(
            docs.map((doc) => ({
              content: doc.pageContent,
              metadata: doc.metadata,
            })),
          ),
        };
      },
      {
        name: 'document_load',
        description:
          '加载文档文件内容（支持 md、pdf、docx、doc），返回文本内容和元数据。',
        schema: loadToolSchema,
      },
    );
  }

  async loadDocument(
    filePath: string,
    fileType: string,
  ): Promise<DocumentChunk[]> {
    switch (fileType) {
      case '.md':
        return this.loadMarkdown(filePath);
      case '.pdf':
        return this.loadPDF(filePath);
      case '.docx':
      case '.doc':
        return this.loadDocx(filePath);
      default:
        throw new Error(`不支持的文件类型: ${fileType}`);
    }
  }

  private loadMarkdown(filePath: string): DocumentChunk[] {
    const text = fs.readFileSync(filePath, 'utf-8');
    return [{ pageContent: text, metadata: { source: 'markdown' } }];
  }

  private async loadPDF(filePath: string): Promise<DocumentChunk[]> {
    const loader = new PDFLoader(filePath);
    const rawDocs = await loader.load();
    return rawDocs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: { ...doc.metadata, source: 'pdf' },
    }));
  }

  private async loadDocx(filePath: string): Promise<DocumentChunk[]> {
    const loader = new DocxLoader(filePath);
    const rawDocs = await loader.load();
    return rawDocs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: { ...doc.metadata, source: 'docx' },
    }));
  }
}
