const express = require("express");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.get("/api/health", (_, res) => res.json({ ok: true, service: "invoice-maker-api" }));
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));