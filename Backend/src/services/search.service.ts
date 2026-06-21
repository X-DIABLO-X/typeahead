import prisma from "../config/db.js";
import distributedRedisClient from "../config/redis.js";

const searchQueue: string[] = [];

/**
 * One-shot initializer: seeds the `trending_searches` ZSET from the
 * top 5,000 rows of SearchQuery so that /api/v2/suggest?rank=trending
 * returns useful results immediately (without waiting for users to
 * type and submit enough searches to fill the ZSET organically).
 *
 * Idempotent: if the ZSET already has members we assume the live
 * flush loop is keeping it fresh and skip the seed.
 */
const seedTrendingZSet = async () => {
    try {
        const existing = await distributedRedisClient.zRange(
            "trending_searches",
            0,
            0
        );
        if (existing && existing.length > 0) return;

        const top = await prisma.searchQuery.findMany({
            orderBy: { count: "desc" },
            take: 5000,
        });

        if (top.length === 0) return;

        const currentTimestampSec = Math.floor(Date.now() / 1000);
        for (const row of top) {
            const historicalCount = Number(row.count);
            const score =
                Math.log10(historicalCount) + currentTimestampSec / 45000;
            await distributedRedisClient.zAdd(
                "trending_searches",
                score,
                row.query
            );
        }
        console.log(
            `[Bootstrap] Seeded trending_searches with ${top.length} entries`
        );
    } catch (err) {
        console.error("[Bootstrap] Failed to seed trending_searches:", err);
    }
};

// Fire and forget — non-blocking, can run alongside the periodic flush loop.
seedTrendingZSet();

export const saveSearchQuery = async (query: string) => {
    const q = query.toLowerCase();
    searchQueue.push(q);
    
    // Batch Size Trigger: Flush immediately if queue is getting too large
    if (searchQueue.length >= 1000) {
        flushQueue(); // Background execution
    }
    
    return { success: true, queued: true };
};

const flushQueue = async () => {
    if (searchQueue.length === 0) return;

    const batch = [...searchQueue];
    searchQueue.length = 0; 

    const counts: Record<string, number> = {};
    for (const q of batch) {
        counts[q] = (counts[q] || 0) + 1;
    }

    try {
        const operations = Object.entries(counts).map(([query, count]) => 
            prisma.searchQuery.upsert({
                where: { query },
                update: { count: { increment: count } },
                create: { query, count }
            })
        );
        
        // 1. Execute bulk transaction in PostgreSQL
        const results = await prisma.$transaction(operations);
        
        // 2. Compute Blended Trending Score and update Redis Distributed Cache
        const currentTimestampSec = Math.floor(Date.now() / 1000);
        
        for (const res of results) {
            // Schema count is BigInt, convert to Number for math
            const historicalCount = Number(res.count); 
            
            // Hacker News style algorithm: log10(popularity) + (recency_decay)
            const score = Math.log10(historicalCount) + (currentTimestampSec / 45000);
            
            await distributedRedisClient.zAdd("trending_searches", score, res.query);
        }
        
        console.log(`[Batch Worker] Flushed ${batch.length} queries & updated Trending Scores`);
    } catch (err) {
        console.error("[Batch Worker] Failed to save batch, re-queuing:", err);
        searchQueue.push(...batch);
    }
};

// Time-based trigger: Flush every 5 seconds regardless of size
setInterval(flushQueue, 5000);
