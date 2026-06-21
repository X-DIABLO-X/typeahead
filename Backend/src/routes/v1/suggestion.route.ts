import { Router } from "express";
import { getSuggestions } from "../../services/suggestion.service.js";

const router = Router();

router.get("/", async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.json([]);

    try {
        const suggestion = await getSuggestions(q);
        return res.status(200).json({ message: "search suggestions (v1)", data: suggestion });
    } catch (error) {
        return res.status(500).json({ error: "failed to fetch suggestion" });
    }
});

export default router;
