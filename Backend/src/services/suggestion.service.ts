import prisma from "../config/db.js";
import distributedRedisClient from "../config/redis.js";

export const getSuggestions = async (q: string) => {
    return await prisma.searchQuery.findMany({
        where: { query: { startsWith: q.toLowerCase() } },
        orderBy: { count: 'desc' },
        take: 10
    });
};

/**
 * Trending (recency-aware) suggestions.
 *
 * Pulls the top 1000 members from the `trending_searches` ZSET (already
 * sorted by blended score = log10(count) + ts/45000 — see
 * search.service.ts:flushQueue), filters to those starting with the
 * typed prefix, then joins with the SearchQuery table to attach the
 * current count for display.
 *
 * Returns at most 10 results, preserving the ZSET's score-based order.
 * Falls back to an empty array if the ZSET is empty (e.g. fresh
 * database before any user searches have been flushed).
 */
export const getTrendingSuggestions = async (q: string) => {
    const prefix = q.toLowerCase();

    // Fetch a wide slice of the trending ZSET so prefix filtering has
    // enough candidates to find matches even for noisy prefixes.
    const topMembers = await distributedRedisClient.zRange(
        "trending_searches",
        0,
        999,
        { REV: true }
    );

    const matches = (topMembers as string[]).filter((m) =>
        typeof m === "string" && m.startsWith(prefix)
    ).slice(0, 10);

    if (matches.length === 0) return [];

    // Hydrate with current counts from Postgres. Using `findMany` with
    // an `in` filter is one round-trip regardless of matches length.
    const rows = await prisma.searchQuery.findMany({
        where: { query: { in: matches } },
    });

    // Index rows by query so we can rebuild the array in ZSET order.
    const byQuery = new Map(rows.map((r) => [r.query, r]));

    // Preserve the original trending order from the ZSET, drop any
    // rows that disappeared from Postgres (shouldn't happen, but safe).
    return matches
        .map((m) => byQuery.get(m))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
};
