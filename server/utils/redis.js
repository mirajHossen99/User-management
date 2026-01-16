// import "dotenv/config";
// import { Redis } from 'ioredis';

// const redisClient = () => {
//     if (process.env.REDIS_URL) {
//         console.log("Redis connected");
//         return process.env.REDIS_URL;
//     }
//     throw new Error('Redis connection failed');
// };

// // Create and export the Redis instance
// export const redis = new Redis(redisClient());



import { Redis } from 'ioredis';
import "dotenv/config";

export const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Stops the app from crashing after 20 attempts
    connectTimeout: 10000,
});

redis.on("error", (err) => {
    // This logs the error instead of crashing the process
    console.error("Redis Connection Error:", err.message);
});

redis.on("connect", () => {
    console.log("Redis connected successfully");
});