import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import {
  AI_TTS_STREAM_EVENT,
  type AiTtsStreamEvent,
} from '../common/stream-event';
import WebSocket from 'ws';
import { OnEvent } from '@nestjs/event-emitter';
type ClientSession = {
  sessionId: string; // 唯一会话ID（区分每个前端客户端）
  clientWs: WebSocket; // 前端客户端的WebSocket连接
  tencentWs?: WebSocket; // 腾讯云TTS的WebSocket连接
  ready: boolean; // 腾讯云连接是否就绪（可以发文本了）
  pendingChunks: string[]; // 待发送的文本分片（腾讯云没就绪时缓存）
  closed: boolean; // 会话是否已关闭
};
@Injectable()
export class TtsRelayService implements OnModuleDestroy {
  private readonly logger = new Logger(TtsRelayService.name);
  private readonly sessions = new Map<string, ClientSession>();
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly appId: number;
  private readonly voiceType: number;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.secretId = configService.get<string>('SECRET_ID') ?? '';
    this.secretKey = configService.get<string>('SECRET_KEY') ?? '';
    this.appId = Number(configService.get<string>('APP_ID') ?? 0);
    this.voiceType = Number(
      configService.get<string>('TTS_VOICE_TYPE') ?? 101001,
    );
  }

  async onModuleDestroy() {
    console.log('onModuleDestroy');
  }

  registerClient(clientWs: WebSocket, wantedSessionId?: string): string {
    const sessionId = wantedSessionId || randomUUID();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.logger.warn(
        `[TTS] duplicate session | sessionId=${sessionId.slice(0, 8)}`,
      );
      this.closeSession(sessionId, 'duplicated session');
    }
    this.sessions.set(sessionId, {
      sessionId,
      clientWs,
      ready: false,
      pendingChunks: [],
      closed: false,
    });
    this.sendClientJson(clientWs, { type: 'session', sessionId });
    this.logger.log(
      `[TTS] client connected | sessionId=${sessionId.slice(0, 8)}`,
    );
    return sessionId;
  }

  unregisterClient(sessionId: string): void {
    this.closeSession(sessionId, 'client disconnected');
  }

  handleDirectSynthesize(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `[TTS] handleDirectSynthesize session not found | sessionId=${sessionId.slice(0, 8)}`,
      );
      return;
    }
    this.logger.log(
      `[TTS] handleDirectSynthesize | sessionId=${sessionId.slice(0, 8)} | textLen=${text.length} | ready=${session.ready}`,
    );
    this.ensureTencentConnection(session);
    this.sendClientJson(session.clientWs, {
      type: 'tts_started',
      sessionId: session.sessionId,
      query: '',
    });
    const chunkSize = 200;
    this.logger.log(
      `[TTS] synthesize enqueueing chunks | count=${Math.ceil(text.length / chunkSize)}`,
    );
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      if (session.ready && session.tencentWs?.readyState === WebSocket.OPEN) {
        this.sendTencentChunk(session, chunk);
      } else {
        session.pendingChunks.push(chunk);
      }
    }
    this.flushPendingChunks(session);
    if (session.tencentWs && session.tencentWs.readyState === WebSocket.OPEN) {
      session.tencentWs.send(
        JSON.stringify({
          session_id: session.sessionId,
          action: 'ACTION_COMPLETE',
        }),
      );
    }
  }

  @OnEvent(AI_TTS_STREAM_EVENT)
  handleAiStreamEvent(event: AiTtsStreamEvent): void {
    const session = this.sessions.get(event.sessionId);
    if (!session) {
      this.logger.warn(
        `[TTS] handleAiStreamEvent session not found | sessionId=${event.sessionId.slice(0, 8)} | type=${event.type}`,
      );
      return;
    }
    this.logger.log(
      `[TTS] handleAiStreamEvent | sessionId=${event.sessionId.slice(0, 8)} | type=${event.type}${event.type === 'chunk' ? ` | chunkLen=${(event as any).chunk?.length ?? 0}` : ''}`,
    );
    switch (event.type) {
      case 'start': {
        this.ensureTencentConnection(session);
        this.sendClientJson(session.clientWs, {
          type: 'tts_started',
          sessionId: session.sessionId,
          query: event.query,
        });
        break;
      }
      case 'chunk': {
        const chunk = event.chunk?.trim();
        if (!chunk) return;
        if (
          !session.ready ||
          !session.tencentWs ||
          session.tencentWs.readyState !== WebSocket.OPEN
        ) {
          session.pendingChunks.push(chunk);
          this.logger.verbose(
            `[TTS] chunk buffered | ready=${session.ready} | pendingCount=${session.pendingChunks.length}`,
          );
          return;
        }
        this.sendTencentChunk(session, chunk);
        break;
      }
      case 'end': {
        this.flushPendingChunks(session);
        if (
          session.tencentWs &&
          session.tencentWs.readyState === WebSocket.OPEN
        ) {
          session.tencentWs.send(
            JSON.stringify({
              session_id: session.sessionId,
              action: 'ACTION_COMPLETE',
            }),
          );
        }
        break;
      }
      case 'error': {
        this.sendClientJson(session.clientWs, {
          type: 'tts_error',
          message: event.error,
        });
        this.closeSession(session.sessionId, 'ai stream error');
        break;
      }
    }
  }
  private ensureTencentConnection(session: ClientSession): void {
    if (session.tencentWs && session.tencentWs.readyState <= WebSocket.OPEN) {
      return;
    }
    if (!this.secretId || !this.secretKey || !this.appId) {
      this.sendClientJson(session.clientWs, {
        type: 'tts_error',
        message: 'TTS 凭证缺失，请检查 SECRET_ID/SECRET_KEY/APP_ID',
      });
      return;
    }
    const url = this.buildTencentTtsWsUrl(session.sessionId);
    const tencentWs = new WebSocket(url);
    session.tencentWs = tencentWs;
    session.ready = false;
    tencentWs.on('open', () => {
      this.logger.log(
        `[TTS] tencent ws opened | sessionId=${session.sessionId.slice(0, 8)}`,
      );
    });
    tencentWs.on('message', (data, isBinary) => {
      if (session.closed) return;
      if (isBinary) {
        if (session.clientWs.readyState === WebSocket.OPEN) {
          session.clientWs.send(data, { binary: true });
        }
        return;
      }
      const raw = data.toString();
      let msg: Record<string, unknown> | undefined;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      if (Number(msg.ready) === 1) {
        session.ready = true;
        this.logger.log(
          `[TTS] tencent ws ready | sessionId=${session.sessionId.slice(0, 8)} | pendingCount=${session.pendingChunks.length}`,
        );
        this.flushPendingChunks(session);
      }
      if (Number(msg.code) && Number(msg.code) !== 0) {
        this.logger.error(
          `[TTS] tencent ws error | sessionId=${session.sessionId.slice(0, 8)} | code=${msg.code} | message=${msg.message}`,
        );
        this.sendClientJson(session.clientWs, {
          type: 'tts_error',
          message: String(msg.message ?? 'Tencent TTS error'),
          code: Number(msg.code),
        });
        this.closeSession(session.sessionId, 'tencent error');
        return;
      }
      if (Number(msg.final) === 1) {
        this.logger.log(
          `[TTS] tencent ws final | sessionId=${session.sessionId.slice(0, 8)}`,
        );
        this.sendClientJson(session.clientWs, { type: 'tts_final' });
      }
    });
    tencentWs.on('error', (error) => {
      this.logger.error(
        `[TTS] tencent ws error | sessionId=${session.sessionId.slice(0, 8)} | message=${error.message}`,
      );
      this.sendClientJson(session.clientWs, {
        type: 'tts_error',
        message: `Tencent ws error: ${error.message}`,
      });
    });

    tencentWs.on('close', () => {
      this.logger.log(
        `[TTS] tencent ws closed | sessionId=${session.sessionId.slice(0, 8)}`,
      );
      session.tencentWs = undefined;
      session.ready = false;
    });
  }

  closeSession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closed = true;

    if (session.tencentWs && session.tencentWs.readyState < WebSocket.CLOSING) {
      session.tencentWs.close();
    }
    if (session.clientWs.readyState < WebSocket.CLOSING) {
      this.sendClientJson(session.clientWs, {
        type: 'tts_closed',
        reason,
      });
      session.clientWs.close();
    }
    this.sessions.delete(sessionId);
    this.logger.log(
      `[TTS] session closed | sessionId=${sessionId.slice(0, 8)} | reason=${reason}`,
    );
  }

  private flushPendingChunks(session: ClientSession): void {
    if (
      !session.ready ||
      !session.tencentWs ||
      session.tencentWs.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    const count = session.pendingChunks.length;
    while (session.pendingChunks.length > 0) {
      const chunk = session.pendingChunks.shift()!;
      if (!chunk) continue;
      this.sendTencentChunk(session, chunk);
    }
    if (count > 0) {
      this.logger.verbose(`[TTS] flushed pending chunks | count=${count}`);
    }
  }
  private sendTencentChunk(session: ClientSession, chunk: string): void {
    if (!session.tencentWs || session.tencentWs.readyState !== WebSocket.OPEN) {
      session.pendingChunks.push(chunk);
      return;
    }
    session.tencentWs.send(
      JSON.stringify({
        session_id: session.sessionId,
        message_id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: 'ACTION_SYNTHESIS',
        data: chunk,
      }),
    );
  }
  private sendClientJson(
    clientWs: WebSocket,
    payload: Record<string, unknown>,
  ): void {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    clientWs.send(JSON.stringify(payload));
  }
  private buildTencentTtsWsUrl(sessionId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = {
      Action: 'TextToStreamAudioWSv2',
      AppId: this.appId,
      Codec: 'mp3',
      Expired: now + 3600,
      SampleRate: 16000,
      SecretId: this.secretId,
      SessionId: sessionId,
      Speed: 0,
      Timestamp: now,
      VoiceType: this.voiceType,
      Volume: 5,
    };

    const signStr = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const rawStr = `GETtts.cloud.tencent.com/stream_wsv2?${signStr}`;
    const signature = createHmac('sha1', this.secretKey)
      .update(rawStr)
      .digest('base64');
    const searchParams = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      Signature: signature,
    });

    return `wss://tts.cloud.tencent.com/stream_wsv2?${searchParams.toString()}`;
  }
}
