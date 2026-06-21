import { Router } from "express";
import distributedRedisClient from "../../config/redis.js";

const router = Router();

router.get("/", async (req, res) => {
    try {
        // ZREVRANGE fetches the top N items sorted by highest score (most recent timestamp)
        // We get the top 10 most recently searched terms!
        const trending = await distributedRedisClient.zRange("trending_searches", 0, 9, { REV: true });
        
        return res.status(200).json({ 
            message: "Trending Searches fetched successfully", 
            data: trending 
        });
    } catch (error) {
        console.error("Trending Route Error:", error);
        return res.status(500).json({ error: "Failed to fetch trending searches" });
    }
});

export default router;
