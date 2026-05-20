import { Injectable, Inject } from '@nestjs/common';
import { type RedisClientType } from 'redis';

@Injectable()
export class RedisService {
  @Inject('REDIS_CLIENT')
  private redisClient: RedisClientType;

  async get(key: string) {
    return await this.redisClient.get(key);
  }
  async ttl(key: string) {
    return await this.redisClient.ttl(key);
  }
  async del(key: string) {
    await this.redisClient.del(key);
  }
  async jsonGet(key: string, path = '.') {
    try {
      return await this.redisClient.json.get(key, { path });
    } catch {
      return null;
    }
  }
  async set(key: string, value: string | number, ex?: number) {
    await this.redisClient.set(key, value);
    if (ex) {
      await this.redisClient.expire(key, ex);
    }
  }

  async keys(pattern: string) {
    return await this.redisClient.keys(pattern);
  }

  async delMultiple(keys: string[]) {
    if (keys.length === 0) return;
    await this.redisClient.del(keys);
  }

  async expire(key: string, seconds: number) {
    await this.redisClient.expire(key, seconds);
  }
}
