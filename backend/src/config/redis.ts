import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis connected');
  });

  await redisClient.connect();
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.disconnect();
    redisClient = null;
  }
}
