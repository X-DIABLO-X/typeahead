import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./config/db.js";
dotenv.config();

const app = express();

// The "Final Boss" BigInt Fix!
// This tells JavaScript how to automatically convert Prisma BigInts into JSON strings
(BigInt.prototype as any).toJSON = function () {
    return Number(this);
};

app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

import v1Router from "./routes/v1/index.js";
import v2Router from "./routes/v2/index.js";

app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);








// We export the app here instead of listening, so our tests can import it!
export default app;