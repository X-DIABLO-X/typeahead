import app from "./server.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 API available at http://localhost:${PORT}/api/v1 and /api/v2`);
});
