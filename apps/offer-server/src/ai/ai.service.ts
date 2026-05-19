import { ChatOpenAI } from '@langchain/openai';
import { Inject, Injectable } from '@nestjs/common';
import { GraphService } from './langgraph/graph.service';
import { DocumentLoadService } from 'src/tool/documentLoad.service';
import { UIMessage } from 'ai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { AIMessageChunk, createAgent } from 'langchain';
import { z } from 'zod';

export interface ResumeSection {
  section: string;
  content: string;
}

const resumeSectionSchema = z.object({
  section: z
    .string()
    .describe(
      '简历部分名称，如：基本信息、教育背景、专业技能、工作经历、项目经验',
    ),
  content: z.string().describe('该部分的完整原始内容，不得修改、总结或添加'),
});

const resumeSplitSchema = z.object({
  sections: z
    .array(resumeSectionSchema)
    .describe('简历分割结果数组，仅输出有内容的 section'),
});

@Injectable()
export class AiService {
  private agent: any;

  constructor(
    @Inject(GraphService) private graphService: GraphService,
    @Inject('CHAT_MODEL_TOOL') private chatModel: ChatOpenAI,
    @Inject('DOCUMENT_LOAD_TOOL') private documentLoadTool: any,
    private readonly documentLoadService: DocumentLoadService,
  ) {
    this.agent = createAgent({
      model: this.chatModel,
      tools: [this.documentLoadTool],
      systemPrompt:
        '你是 简历分割助手，需要使用 document_load 工具加载后再分割。',
    });
  }

  async stream(messages: UIMessage[]) {
    const lcMessages = await toBaseMessages(messages);
    const lgStream = await this.agent.stream(
      { messages: lcMessages },
      {
        streamMode: ['messages', 'values'],
        recursionLimit: 12,
      },
    );

    return toUIMessageStream(lgStream as AsyncIterable<AIMessageChunk>);
  }

  async splitResume(
    filePath: string,
    fileType: string,
  ): Promise<ResumeSection[]> {
    const docs = await this.documentLoadService.loadDocument(
      filePath,
      fileType,
    );
    const rawContent = docs.map((d) => d.pageContent).join('\n\n');
    console.log(
      `[splitResume] 文档加载完成，总长度: ${rawContent.length} 字符`,
    );

    const splitModel = this.chatModel.withStructuredOutput(resumeSplitSchema, {
      name: 'resume_split',
    });

    const prompt = `以下是一份完整的简历原始文本。请将其按五个部分分割，**每一个字、每一个标点都必须原样保留**。

=== 简历原始文本开始 ===
${rawContent}
=== 简历原始文本结束 ===

分割为以下五个部分（有内容的才输出，没内容的不输出）：
1. 基本信息：姓名、联系方式、邮箱、地址等个人信息
2. 教育背景：学历、学校、专业、毕业时间等
3. 专业技能：技术栈、工具、语言能力、证书等
4. 工作经历：公司名称、职位、工作时间、职责描述等
5. 项目经验：项目名称、项目描述、技术架构、个人贡献等

致命规则 —— 违反任何一条即为失败：
- 每个 section 的 content 必须是原始文本中摘出的**原文片段**，逐字逐句原样复制，连空格和换行都不能变
- 严禁总结、概括、改写、精简任何内容
- 严禁添加原始文本中不存在的任何信息
- 严禁遗漏任何一行原始内容：所有原始文本必须完整分配到各 section 中
- 如果某行文本可以归属多个 section，选择最匹配的那个
- section 名称使用中文（如"基本信息"）`;

    const raw = await splitModel.invoke([{ role: 'user', content: prompt }]);
    console.log(`[splitResume] LLM 分割完成`);

    const result: { sections: ResumeSection[] } =
      'parsed' in raw
        ? (raw.parsed as { sections: ResumeSection[] })
        : (raw as { sections: ResumeSection[] });

    const filtered = result.sections.filter(
      (s) => s.content && s.content.trim().length > 0,
    );

    const totalSplitLength = filtered.reduce(
      (sum, s) => sum + s.content.length,
      0,
    );
    console.log(
      `[splitResume] 分割为 ${filtered.length} 个 section，内容总长度: ${totalSplitLength}（原长度: ${rawContent.length}）`,
    );

    return filtered;
  }
}
