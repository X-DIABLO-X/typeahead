import { Router } from "express";
import suggestionRoute from "./suggestion.route.js";
import searchRoute from "./search.route.js";

const router = Router();

router.use("/suggest", suggestionRoute);
router.use("/search", searchRoute);

export default router;
