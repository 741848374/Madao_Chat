import { Module } from '@nestjs/common';
import { ChatModelService } from './chatModel.service';
import { WebSearchService } from './webSearch.service';
import { MessageService } from './message.service';
import { MilvusService } from './milvus.service';
import { EmbeddingsService } from './embeddings.service';
import { DocumentLoadService } from './documentLoad.service';
import { GithubService } from './github.service';

@Module({
  providers: [
    ChatModelService,
    WebSearchService,
    MilvusService,
    EmbeddingsService,
    DocumentLoadService,
    GithubService,
    {
      provide: 'DOCUMENT_LOAD_TOOL',
      useFactory: (documentLoadService: DocumentLoadService) =>
        documentLoadService.tool,
      inject: [DocumentLoadService],
    },
    {
      provide: 'CHAT_MODEL_TOOL',
      useFactory: (chatModelService: ChatModelService) =>
        chatModelService.getModel(),
      inject: [ChatModelService],
    },
    {
      provide: 'EMBEDDINGS_TOOL',
      useFactory: (embeddingsService: EmbeddingsService) =>
        embeddingsService.getEmbeddings(),
      inject: [EmbeddingsService],
    },
    {
      provide: 'WEB_SEARCH_TOOL',
      useFactory: (webSearchService: WebSearchService) => webSearchService.tool,
      inject: [WebSearchService],
    },
    MessageService,
    {
      provide: 'MESSAGE_TOOL',
      useFactory: (messageService: MessageService) => messageService.tool,
      inject: [MessageService],
    },
    {
      provide: 'GITHUB_REPO_DETAIL_TOOL',
      useFactory: (githubService: GithubService) =>
        githubService.repoDetailTool,
      inject: [GithubService],
    },
    {
      provide: 'GITHUB_USER_REPOS_TOOL',
      useFactory: (githubService: GithubService) => githubService.userReposTool,
      inject: [GithubService],
    },
  ],
  exports: [
    'CHAT_MODEL_TOOL',
    'WEB_SEARCH_TOOL',
    'MESSAGE_TOOL',
    'EMBEDDINGS_TOOL',
    'DOCUMENT_LOAD_TOOL',
    'GITHUB_REPO_DETAIL_TOOL',
    'GITHUB_USER_REPOS_TOOL',
    MilvusService,
    DocumentLoadService,
    GithubService,
  ],
})
export class ToolModule {}
