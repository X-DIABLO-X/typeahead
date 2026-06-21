import { createClient } from "redis";
import { ConsistentHash } from "../utils/ConsistentHash.js";
import "dotenv/config";

// 1. Grab all 3 URLs from the docker-compose environment variable
const redisUrls = process.env.REDIS_URLS 
    ? process.env.REDIS_URLS.split(",") 
    : ["redis://localhost:6379"];

// 2. Initialize our Mathematical Hash Ring
const hashRing = new ConsistentHash(redisUrls);
const clients = new Map<string, ReturnType<typeof createClient>>();

// 3. Loop through and connect to all 3 Redis Nodes simultaneously
for (const url of redisUrls) {
    const client = createClient({ url });
    
    client.on("error", (err) => console.error(`Redis Error on ${url}:`, err));
    client.on("connect", () => console.log(`Connected to Redis node: ${url}`));
    
    client.connect().catch(console.error);
    clients.set(url, client);
}

// 4. The Magic Wrapper: Routes every request to the correct node using the Hash Ring!
const distributedRedisClient = {
    getNodeUrlFor(key: string): string {
        return hashRing.getNode(key)!;
    },
    
    getClientFor(key: string) {
        const url = this.getNodeUrlFor(key);
        return clients.get(url)!;
    },

    async get(key: string) {
        const client = this.getClientFor(key);
        return await client.get(key);
    },

    async setEx(key: string, seconds: number, value: string) {
        const client = this.getClientFor(key);
        return await client.setEx(key, seconds, value);
    },

    async zAdd(key: string, score: number, member: string) {
        const client = this.getClientFor(key);
        return await client.zAdd(key, [{ score, value: member }]);
    },

    async zRange(key: string, start: number, stop: number, options?: any) {
        const client = this.getClientFor(key);
        return await client.zRange(key, start, stop, options);
    }
};

export default distributedRedisClient;