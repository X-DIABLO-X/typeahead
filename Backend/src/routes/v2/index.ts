import { Router } from "express";
import suggestionRoute from "./suggestion.route.js";
import searchRoute from "../v1/search.route.js";
import cacheRoute from "./cache.route.js";
import trendingRoute from "./trending.route.js";

const router = Router();

router.use("/suggest", suggestionRoute);
router.use("/search", searchRoute);
router.use("/cache", cacheRoute);
router.use("/trending", trendingRoute);

export default router;
