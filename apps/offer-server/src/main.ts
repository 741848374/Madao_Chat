import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { FormatResponseInterceptor } from './format-response.interceptor';
import { InvokeRecordInterceptor } from './invoke-record.interceptor';
import { json, urlencoded } from 'express';
import { WebSocketServer } from 'ws';
import { TtsRelayService } from './speech/tts-relay.service';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const ttsRelayService = app.get(TtsRelayService);

  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new FormatResponseInterceptor());
  app.useGlobalInterceptors(new InvokeRecordInterceptor());

  const server = app.getHttpServer();
  console.log('http server:', app.getHttpServer());
  const ttsWs = new WebSocketServer({ server, path: '/speech/tts/ws' });
  console.log('[TTS] WebSocket server created at /speech/tts/ws');

  ttsWs.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url ?? '', 'http://localhost');
    const wantedSessionId = reqUrl.searchParams.get('sessionId') ?? undefined;
    console.log(`[TTS] WS client connecting | wantedSessionId=${wantedSessionId ?? '(none)'}`);
    const sessionId = ttsRelayService.registerClient(ws, wantedSessionId);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[TTS] WS message received | sessionId=${sessionId?.slice(0, 8)} | type=${msg.type}${msg.text ? ` | textLen=${msg.text.length}` : ''}`);
        if (msg.type === 'synthesize' && typeof msg.text === 'string') {
          ttsRelayService.handleDirectSynthesize(sessionId, msg.text);
        }
      } catch {
        console.warn('[TTS] WS message parse failed (binary/unknown)');
      }
    });

    ws.on('close', () => {
      console.log(`[TTS] WS client disconnected | sessionId=${sessionId?.slice(0, 8)}`);
      ttsRelayService.unregisterClient(sessionId);
    });
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
      : (origin, callback) => callback(null, origin || '*'),
    credentials: true,
    exposedHeaders: ['X-Thread-Id'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
