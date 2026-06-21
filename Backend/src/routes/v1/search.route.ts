import { Router } from "express";
import { saveSearchQuery } from "../../services/search.service.js";

const router = Router();

router.post("/", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
        const result = await saveSearchQuery(query);
        return res.json({ message: "Search saved successfully (v1)", data: result });
    } catch (error) {
        return res.status(500).json({ error: "Failed to save search query" });
    }
});

export default router;
