import {
  Annotation,
  Command,
  END,
  LangGraphRunnableConfig,
  messagesStateReducer,
  START,
  StateGraph,
  GraphInterrupt,
  isGraphInterrupt,
} from '@langchain/langgraph';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';
import { randomUUID } from 'crypto';

import { generateNode } from './nodes/generate.node';
import { intentRouteNode } from './nodes/intent.route.node';
import { notAvailableNode } from './nodes/notAvailable.node';
import { inviteCodeCheckNode } from './nodes/inviteCodeCheck.node';
import { inviteCodeQueryNode } from './nodes/inviteCodeQuery.node';
import { decomposeNode } from './nodes/decompose.node';
import { retrieveNode } from './nodes/retrieve.node';
import { answerNode } from './nodes/answer.node';
import { planRetrievalNode } from './nodes/planRetrieval.node';
import { clearSessionNode } from './nodes/clearSession.node';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatOpenAI } from '@langchain/openai';
import { UIMessage } from 'ai';
import { Tool } from '@langchain/core/tools';
import { AI_TTS_STREAM_EVENT } from '../../common/stream-event';

import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { messageNode } from './nodes/message.node';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/User.entity';
import { RedisService } from '../../redis/redis.service';
import { MilvusService } from '../../tool/milvus.service';

@Injectable()
export class GraphService {
  private graph;
  private checkpointer: RedisSaver;
  private graphInitPromise: Promise<void>;

  constructor(
    @Inject('CHAT_MODEL_TOOL') private chatModel: ChatOpenAI,
    @Inject('WEB_SEARCH_TOOL') private webSearchTool: Tool,
    @Inject('MESSAGE_TOOL') private messageTool: Tool,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly milvusService: MilvusService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.graphInitPromise = this.initGraphAsync();
  }

  private async initGraphAsync() {
    const host = this.configService.get('REDIS_HOST');
    const port = this.configService.get('REDIS_PORT');
    const db = this.configService.get('REDIS_DB');
    const redisUrl = `redis://${host}:${port}/${db}`;
    this.checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 60 * 2, // 会话保留2小时（单位：分钟），refreshOnRead 会在每次读取时续期
      refreshOnRead: true,
    });
    this.initGraph();
  }

  private bindNode<T extends (...args: any[]) => any>(
    nodeFn: T,
    tools: Record<string, any>,
  ) {
    return (state: any, config?: LangGraphRunnableConfig) => {
      return nodeFn(state, tools, config);
    };
  }

  private routeByIntent(state: any) {
    if (state.intent === 'end_interview') {
      if (state.inviteCodeValidated) {
        Logger.log(
          '[路由:intentRoute] → clearSession (结束面试意向，已验证)',
          'GraphService',
        );
        return 'clearSession';
      }
      if (state.inviteCode) {
        Logger.log(
          '[路由:intentRoute] → inviteCodeQuery (结束面试意向，需验证邀请码)',
          'GraphService',
        );
        return 'inviteCodeQuery';
      }
      Logger.log(
        '[路由:intentRoute] → inviteCodeCheck (结束面试意向，无邀请码需先验证)',
        'GraphService',
      );
      return 'inviteCodeCheck';
    }
    if (state.intent === 'interviewee') {
      Logger.log(
        '[路由:intentRoute] → notAvailable (interviewee模式)',
        'GraphService',
      );
      return 'notAvailable';
    }
    if (state.inviteCodeValidated) {
      Logger.log('[路由:intentRoute] → decompose (已验证)', 'GraphService');
      return 'decompose';
    }
    if (state.intent === 'interviewer') {
      if (state.inviteCode) {
        Logger.log(
          `[路由:intentRoute] → inviteCodeQuery (有邀请码: "${state.inviteCode}")`,
          'GraphService',
        );
        return 'inviteCodeQuery';
      }
      Logger.log(
        '[路由:intentRoute] → inviteCodeCheck (无邀请码)',
        'GraphService',
      );
      return 'inviteCodeCheck';
    }
    Logger.log(
      `[路由:intentRoute] → generate (general: "${state.intent}")`,
      'GraphService',
    );
    return 'generate';
  }

  private routeAfterInviteCodeCheck(state: any) {
    if (state.inviteCodeValidated) {
      if (state.intent === 'end_interview') {
        Logger.log(
          '[路由:inviteCodeCheck] → clearSession (已验证, 结束面试)',
          'GraphService',
        );
        return 'clearSession';
      }
      Logger.log('[路由:inviteCodeCheck] → decompose (已验证)', 'GraphService');
      return 'decompose';
    }
    if (state.inviteCode) {
      Logger.log(
        `[路由:inviteCodeCheck] → inviteCodeQuery (提取到: "${state.inviteCode}")`,
        'GraphService',
      );
      return 'inviteCodeQuery';
    }
    Logger.log('[路由:inviteCodeCheck] → END (无邀请码)', 'GraphService');
    return END;
  }

  private routeAfterInviteCodeQuery(state: any) {
    if (state.inviteCodeValidated) {
      if (state.intent === 'end_interview') {
        Logger.log(
          '[路由:inviteCodeQuery] → clearSession (校验通过, 结束面试)',
          'GraphService',
        );
        return 'clearSession';
      }
      Logger.log(
        '[路由:inviteCodeQuery] → decompose (校验通过)',
        'GraphService',
      );
      return 'decompose';
    }
    Logger.log('[路由:inviteCodeQuery] → END (校验失败)', 'GraphService');
    return END;
  }

  private routeAfterDecompose(state: any) {
    if (state.hasValidQuestion) {
      Logger.log(
        `[路由:decompose] → retrieve (${state.subQuestions?.length ?? 0}个子问题)`,
        'GraphService',
      );
      return 'retrieve';
    }
    Logger.log('[路由:decompose] → END (无有效问题)', 'GraphService');
    return END;
  }

  private routeAfterAnswer(state: any) {
    const idx: number = state.currentSubIdx ?? 0;
    const subs: string[] = state.subQuestions ?? [];
    if (idx < subs.length) {
      Logger.log(
        `[路由:answer] → retrieve (下一子问题 ${idx + 1}/${subs.length})`,
        'GraphService',
      );
      return 'retrieve';
    }
    Logger.log(
      `[路由:answer] → END (全部回答完毕 ${subs.length}/${subs.length})`,
      'GraphService',
    );
    return END;
  }

  private routeAfterPlan(state: any) {
    if (state.needMoreRetrieval) {
      Logger.log(
        `[路由:planRetrieval] → retrieve (R${state.retrievalRounds ?? 0} 需继续检索)`,
        'GraphService',
      );
      return 'retrieve';
    }
    Logger.log(
      `[路由:planRetrieval] → answer (R${state.retrievalRounds ?? 0} 资料充足)`,
      'GraphService',
    );
    return 'answer';
  }

  private initGraph() {
    const graphState = Annotation.Root({
      messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
      }),
      stream: Annotation({
        reducer: (x: any[], y: any) => x.concat(y),
        default: () => [],
      }),
      generation: Annotation,
      intent: Annotation,
      intentReason: Annotation,
      username: Annotation,
      inviteCode: Annotation,
      inviteCodeValidated: Annotation,
      inviteeUserInfo: Annotation,
      query: Annotation,
      interruptInput: Annotation,
      hasValidQuestion: Annotation,
      subQuestions: Annotation,
      mainTopic: Annotation,
      decomposeReason: Annotation,
      currentSubIdx: Annotation,
      retrievalDocs: Annotation,
      subAnswers: Annotation,
      searchQuery: Annotation,
      allRetrievedDocs: Annotation,
      retrievalRounds: Annotation,
      needMoreRetrieval: Annotation,
      nextSearchQuery: Annotation,
      planReason: Annotation,
      chatMemory: Annotation({
        reducer: (x: any[], y: any[]) => x.concat(y),
        default: () => [],
      }),
    });

    const builder = new StateGraph(graphState)
      .addNode(
        'intentRoute',
        this.bindNode(intentRouteNode, {
          chatModel: this.chatModel,
          redisService: this.redisService,
          messageTool: this.messageTool,
        }),
      )
      .addNode(
        'generate',
        this.bindNode(generateNode, { chatModel: this.chatModel }),
      )
      .addNode(
        'notAvailable',
        this.bindNode(notAvailableNode, { messageTool: this.messageTool }),
      )
      .addNode(
        'inviteCodeCheck',
        this.bindNode(inviteCodeCheckNode, {
          chatModel: this.chatModel,
          messageTool: this.messageTool,
        }),
      )
      .addNode(
        'inviteCodeQuery',
        this.bindNode(inviteCodeQueryNode, {
          userRepository: this.userRepository,
          messageTool: this.messageTool,
          redisService: this.redisService,
        }),
      )
      .addNode(
        'decompose',
        this.bindNode(decomposeNode, {
          chatModel: this.chatModel,
          messageTool: this.messageTool,
        }),
      )
      .addNode(
        'retrieve',
        this.bindNode(retrieveNode, {
          milvusService: this.milvusService,
        }),
      )
      .addNode(
        'planRetrieval',
        this.bindNode(planRetrievalNode, {
          chatModel: this.chatModel,
        }),
      )
      .addNode(
        'answer',
        this.bindNode(answerNode, {
          chatModel: this.chatModel,
          messageTool: this.messageTool,
          webSearchTool: this.webSearchTool,
        }),
      )
      .addNode(
        'clearSession',
        this.bindNode(clearSessionNode, {
          messageTool: this.messageTool,
          redisService: this.redisService,
        }),
      )
      .addEdge(START, 'intentRoute')
      .addConditionalEdges('intentRoute', this.routeByIntent.bind(this), {
        generate: 'generate',
        notAvailable: 'notAvailable',
        inviteCodeCheck: 'inviteCodeCheck',
        inviteCodeQuery: 'inviteCodeQuery',
        decompose: 'decompose',
        clearSession: 'clearSession',
      })
      .addConditionalEdges(
        'inviteCodeCheck',
        this.routeAfterInviteCodeCheck.bind(this),
        {
          inviteCodeQuery: 'inviteCodeQuery',
          decompose: 'decompose',
          clearSession: 'clearSession',
          [END]: END,
        },
      )
      .addConditionalEdges(
        'inviteCodeQuery',
        this.routeAfterInviteCodeQuery.bind(this),
        {
          decompose: 'decompose',
          clearSession: 'clearSession',
          [END]: END,
        },
      )
      .addConditionalEdges('decompose', this.routeAfterDecompose.bind(this), {
        retrieve: 'retrieve',
        [END]: END,
      })
      .addEdge('retrieve', 'planRetrieval')
      .addConditionalEdges('planRetrieval', this.routeAfterPlan.bind(this), {
        retrieve: 'retrieve',
        answer: 'answer',
      })
      .addConditionalEdges('answer', this.routeAfterAnswer.bind(this), {
        retrieve: 'retrieve',
        [END]: END,
      })
      .addEdge('generate', END)
      .addEdge('notAvailable', END)
      .addEdge('clearSession', END);

    this.graph = builder.compile({
      checkpointer: this.checkpointer,
    });
  }

  private async trimCheckpoints(threadId: string, maxCheckpoints = 20) {
    if (!this.checkpointer) return;

    try {
      const checkpoints: any[] = [];
      for await (const tuple of this.checkpointer.list(
        { configurable: { thread_id: threadId } },
        { limit: maxCheckpoints + 10 },
      )) {
        checkpoints.push(tuple);
      }

      if (checkpoints.length <= maxCheckpoints) return;

      const toDelete = checkpoints.slice(maxCheckpoints);
      Logger.log(
        `[Checkpoint裁剪] threadId=${threadId.slice(0, 8)} | 当前${checkpoints.length}条 > 上限${maxCheckpoints}, 删除${toDelete.length}条旧快照`,
        'GraphService',
      );

      for (const tuple of toDelete) {
        const cid: string = tuple.config.configurable.checkpoint_id;
        const ns: string = tuple.config.configurable.checkpoint_ns ?? '';

        const ckKey = `checkpoint:${threadId}:${ns}:${cid}`;
        const writeKeys = await this.redisService.keys(
          `checkpoint_write:${threadId}:${ns}:${cid}:*`,
        );
        const zsetKey = `write_keys_zset:${threadId}:${ns}:${cid}`;

        const allKeys = [ckKey, ...writeKeys, zsetKey];
        await this.redisService.delMultiple(allKeys);
      }

      Logger.log(
        `[Checkpoint裁剪] 完成 | threadId=${threadId.slice(0, 8)} | 保留${maxCheckpoints}条`,
        'GraphService',
      );
    } catch (error) {
      Logger.error(
        `[Checkpoint裁剪] 失败 | threadId=${threadId.slice(0, 8)} | ${error}`,
        error instanceof Error ? error.stack : undefined,
        'GraphService',
      );
    }
  }

  public async run({
    messages,
    username,
    threadId,
    resume,
    ttsSessionId,
  }: {
    messages: UIMessage[];
    username: string;
    threadId?: string;
    resume?: string;
    ttsSessionId?: string;
  }) {
    const lcMessages = await toBaseMessages(messages);
    const thread_id = threadId || randomUUID();
    const isResume = resume !== undefined && resume !== null;
    const isNewThread = !threadId;

    const lastHumanContent =
      [...lcMessages].reverse().find((m: any) => {
        const t = m._getType?.() ?? m.getType?.() ?? '';
        return t === 'human';
      })?.content ?? '';

    Logger.log(
      `[图执行] 开始 | threadId=${thread_id.slice(0, 8)} | username="${username || '(无)'}" | resume=${isResume} | newThread=${isNewThread} | humanMsg="${(typeof lastHumanContent === 'string' ? lastHumanContent : '').slice(0, 50)}"`,
      'GraphService',
    );
    const config = {
      version: 'v2' as const,
      configurable: { thread_id },
      recursionLimit: 50,
    };

    let input: any;
    if (isResume) {
      const humanMsgs = [...lcMessages].reverse().filter((m: any) => {
        const t = m._getType?.() ?? m.getType?.() ?? '';
        return t === 'human';
      });

      const originalQuery = (humanMsgs[1]?.content ??
        humanMsgs[0]?.content ??
        '') as string;

      Logger.log(
        `[图执行] 恢复中断 | resumeValue="${String(resume ?? '').slice(0, 30)}" | query="${originalQuery.slice(0, 50)}"`,
        'GraphService',
      );
      Logger.log(
        `[图执行|诊断] 恢复中断input | threadId=${thread_id.slice(0, 8)} | username="${username || '(无)'}" | resume有值=${!!resume} | originalQuery="${originalQuery.slice(0, 50)}"`,
        'GraphService',
      );

      input = new Command({
        resume,
        update: {
          messages: lcMessages,
          query: originalQuery,
          chatMemory: [],
        },
      });
    } else if (isNewThread) {
      input = {
        messages: lcMessages,
        stream: [],
        generation: '',
        intent: '',
        intentReason: '',
        username: username ?? '',
        inviteCode: null,
        inviteCodeValidated: false,
        inviteeUserInfo: null,
        query: lastHumanContent,
        hasValidQuestion: false,
        subQuestions: [],
        mainTopic: '',
        decomposeReason: '',
        currentSubIdx: 0,
        retrievalDocs: [],
        subAnswers: [],
        searchQuery: '',
        allRetrievedDocs: [],
        retrievalRounds: 0,
        needMoreRetrieval: true,
        nextSearchQuery: '',
        planReason: '',
        chatMemory: [],
      };
    } else {
      Logger.log(
        `[图执行] 继续已有会话 | query="${lastHumanContent.slice(0, 30)}"`,
        'GraphService',
      );
      Logger.log(
        `[图执行|诊断] 继续会话input | threadId=${thread_id.slice(0, 8)} | username="${username || '(无)'}" | isResume=${isResume} | isNewThread=${isNewThread} | 注意: username/inviteCodeValidated等将从checkpoint恢复`,
        'GraphService',
      );
      input = {
        messages: lcMessages,
        stream: [],
        query: lastHumanContent,
        username: username ?? '',
        chatMemory: [],
      };
    }

    try {
      await this.graphInitPromise;

      await this.trimCheckpoints(thread_id);

      const rawStream = await this.graph.streamEvents(input, config);
      const hiddenNodes = new Set(['intentRoute']);

      const filteredStream = async function* () {
        try {
          for await (const event of rawStream) {
            if (event.data.chunk?.__interrupt__) {
              const interruptValue = event.data.chunk.__interrupt__[0].value;
              Logger.log(
                `[图执行] 触发interrupt | type=${interruptValue.type} | msg="${(interruptValue.message ?? '').slice(0, 40)}"`,
                'GraphService',
              );
              const res = await this.messageTool.invoke({
                type: interruptValue.type,
                content: interruptValue.message,
              });
              const toolCallId = randomUUID();
              yield {
                event: 'on_tool_start',
                name: 'message',
                run_id: toolCallId,
                data: {
                  input: {
                    type: interruptValue.type,
                    content: interruptValue.message,
                  },
                },
              };
              yield {
                event: 'on_tool_end',
                name: 'message',
                run_id: toolCallId,
                data: {
                  output: res,
                },
              };
            }

            if (ttsSessionId && event.event === 'on_chat_model_stream') {
              const chunkContent = event.data?.chunk?.content;
              if (typeof chunkContent === 'string' && chunkContent) {
                this.eventEmitter.emit(AI_TTS_STREAM_EVENT, {
                  type: 'chunk',
                  sessionId: ttsSessionId,
                  chunk: chunkContent,
                });
              }
            }

            const nodeName = event.metadata?.langgraph_node;
            if (hiddenNodes.has(nodeName)) {
              if (event.event === 'on_chat_model_stream') continue;
            }
            yield event;
          }

          if (ttsSessionId) {
            this.eventEmitter.emit(AI_TTS_STREAM_EVENT, {
              type: 'end',
              sessionId: ttsSessionId,
            });
            Logger.log(
              `[TTS] emit end | sessionId=${ttsSessionId.slice(0, 8)}`,
              'GraphService',
            );
          }

          Logger.log(
            `[图执行] 流完成 | threadId=${thread_id.slice(0, 8)}`,
            'GraphService',
          );
        } catch (error) {
          Logger.error(
            `[图执行] 流中断 | threadId=${thread_id.slice(0, 8)} | ${error}`,
            error instanceof Error ? error.stack : undefined,
            'GraphService',
          );
          throw error;
        }
      }.call(this);

      const stream = toUIMessageStream(filteredStream);
      return { stream, threadId: thread_id };
    } catch (error) {
      Logger.error(
        `[图执行] 异常 | threadId=${thread_id.slice(0, 8)} | ${error}`,
        error instanceof Error ? error.stack : undefined,
        'GraphService',
      );
      throw new Error(`Graph stream error: ${error.message}`, { cause: error });
    }
  }

  public async checkInviteCode(username: string) {
    if (!username) return { inviteCode: null, validated: false };

    try {
      const redisKey = `invite_code:${username}`;
      const cached = await this.redisService.get(redisKey);
      if (cached) {
        const { inviteCode } = JSON.parse(cached);
        Logger.log(
          `[邀请码检查] Redis命中 | username="${username}" | inviteCode="${inviteCode}"`,
          'GraphService',
        );
        return { inviteCode, validated: true };
      }
    } catch (err) {
      Logger.error(
        `[邀请码检查] Redis查询异常 | username="${username}" | ${err}`,
        err instanceof Error ? err.stack : undefined,
        'GraphService',
      );
    }

    Logger.log(`[邀请码检查] 未找到 | username="${username}"`, 'GraphService');
    return { inviteCode: null, validated: false };
  }

  public async getMemory(threadId: string) {
    await this.graphInitPromise;

    try {
      const state = await this.graph.getState({
        configurable: { thread_id: threadId },
      });

      if (!state) {
        Logger.log(
          `[记忆查询] threadId=${threadId.slice(0, 8)} | 无状态记录`,
          'GraphService',
        );
        return { threadId, chatMemory: [] };
      }

      const chatMemory = (state.values as any)?.chatMemory ?? [];
      const generation = (state.values as any)?.generation ?? '';

      Logger.log(
        `[记忆查询] threadId=${threadId.slice(0, 8)} | chatMemory条数=${chatMemory.length} | generation="${generation}"`,
        'GraphService',
      );

      if (generation === 'sessionCleared') {
        Logger.log(
          `[记忆查询] threadId=${threadId.slice(0, 8)} | 会话已清除，返回空记忆`,
          'GraphService',
        );
        return { threadId, chatMemory: [] };
      }

      return { threadId, chatMemory };
    } catch (error) {
      Logger.error(
        `[记忆查询] 失败 | threadId=${threadId.slice(0, 8)} | ${error}`,
        error instanceof Error ? error.stack : undefined,
        'GraphService',
      );
      return { threadId, chatMemory: [] };
    }
  }
}
