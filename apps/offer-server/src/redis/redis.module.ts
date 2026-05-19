import { Global, Logger, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: 'REDIS_CLIENT',
      useFactory(configService: ConfigService) {
        const client = createClient({
          socket: {
            host: configService.get('REDIS_HOST'),
            port: Number(configService.get('REDIS_PORT')),
            reconnectStrategy: (retries) => {
              if (retries > 20) {
                Logger.error(
                  `Redis 重连失败，已达最大重试次数 (${retries})`,
                  'RedisModule',
                );
                return new Error('Redis max retries exceeded');
              }
              const delay = Math.min(retries * 1000, 10000);
              Logger.warn(
                `Redis 连接断开，${delay}ms 后重试 (第${retries}次)`,
                'RedisModule',
              );
              return delay;
            },
          },
          database: Number(configService.get('REDIS_DB')),
        });

        client.on('error', (err) => {
          Logger.error(
            `Redis 客户端错误: ${err.message}`,
            err.stack,
            'RedisModule',
          );
        });

        client.on('connect', () => {
          Logger.log('Redis 连接成功', 'RedisModule');
        });

        client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
