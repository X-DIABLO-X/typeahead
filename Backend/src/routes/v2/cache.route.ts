import { Router } from "express";
import distributedRedisClient from "../../config/redis.js";

const router = Router();

router.get("/debug", (req, res) => {
    const prefix = req.query.prefix as string;
    
    if (!prefix) {
        return res.status(400).json({ error: "?prefix= query parameter is required" });
    }

    // Call our ConsistentHash ring to find out EXACTLY which Redis node owns this word
    const targetNode = distributedRedisClient.getNodeUrlFor(prefix.toLowerCase());
    
    return res.json({
        prefix: prefix,
        target_node: targetNode,
        message: `Consistent Hashing assigned prefix '${prefix}' to node: ${targetNode}`
    });
});

export default router;
