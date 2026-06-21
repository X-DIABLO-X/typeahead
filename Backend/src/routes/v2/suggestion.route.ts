import { Router } from "express";
import {
    getSuggestions,
    getTrendingSuggestions,
} from "../../services/suggestion.service.js";
import redisClient from "../../config/redis.js";

const router = Router();

router.get("/", async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.json([]);

    // The UI only exposes trending ranking, so it's the default.
    // (Pass ?rank=popular to fall back to count-only ordering.)
    const rank = req.query.rank === "popular" ? "popular" : "trending";

    // Cache key is namespaced by ranking mode so a popular-mode result
    // doesn't bleed into a trending-mode request (and vice versa).
    const cacheKey = `${q.toLowerCase()}:${rank}`;

    try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            return res.status(200).json({
                message: `cache hit (v2, ${rank})`,
                data: JSON.parse(cachedData),
            });
        }

        const suggestion =
            rank === "trending"
                ? await getTrendingSuggestions(q)
                : await getSuggestions(q);

        await redisClient.setEx(cacheKey, 60, JSON.stringify(suggestion));

        return res.status(200).json({
            message: `search suggestions (v2, ${rank})`,
            data: suggestion,
        });
    } catch (error) {
        return res.status(500).json({ error: "failed to fetch suggestion" });
    }
});

export default router;
