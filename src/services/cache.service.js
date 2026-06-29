'use strict';

const redis = require('redis');

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisClient = redis.createClient(
  REDIS_URL
    ? { url: REDIS_URL }
    : {
        socket: {
          host: REDIS_HOST,
          port: Number(REDIS_PORT),
          reconnectStrategy: (retries) => {
            // Stop reconnecting after 10 retries (roughly 10 seconds)
            if (retries > 10) {
              console.warn('Redis: Max reconnection attempts exceeded. Cache disabled.');
              return new Error('Redis max retries exceeded');
            }
            // Exponential backoff: 100ms, 200ms, 400ms, ...
            return Math.min(retries * 100, 3000);
          },
        },
        password: REDIS_PASSWORD,
      }
);

let isConnected = false;
let errorLogged = false;

redisClient.on('error', (err) => {
  if (!errorLogged && err.code === 'ECONNREFUSED') {
    console.warn(`Redis: Connection refused on ${REDIS_HOST}:${REDIS_PORT}. Caching disabled. To enable, start Redis or set REDIS_URL.`);
    errorLogged = true;
  }
});

async function initCache() {
  if (isConnected) return redisClient;

  try {
    await redisClient.connect();
    isConnected = true;
    console.log('✅ Redis cache connected');
  } catch (error) {
    // Redis is optional - just warn and continue
    console.warn(`⚠️  Redis unavailable: ${error.message || error}. Caching disabled.`);
    // Don't throw - let the app continue without cache
  }

  return redisClient;
}

function isReady() {
  return redisClient?.isOpen;
}

async function getCache(key) {
  if (!isReady()) return null;
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch (error) {
    console.error(`Redis get failed for key=${key}:`, error.message || error);
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 60) {
  if (!isReady()) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redisClient.setEx(key, ttlSeconds, payload);
    } else {
      await redisClient.set(key, payload);
    }
  } catch (error) {
    console.error(`Redis set failed for key=${key}:`, error.message || error);
  }
}

async function deleteCache(key) {
  if (!isReady()) return;
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`Redis delete failed for key=${key}:`, error.message || error);
  }
}

async function deleteCacheByPrefix(prefix) {
  if (!isReady()) return;
  try {
    const iterator = redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 });
    const keys = [];
    for await (const key of iterator) {
      keys.push(key);
    }
    if (keys.length) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(`Redis deleteByPrefix failed for prefix=${prefix}:`, error.message || error);
  }
}

module.exports = {
  initCache,
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPrefix,
};
