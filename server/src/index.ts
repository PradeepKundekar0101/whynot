import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallet";
import webhookRoutes from "./routes/webhook";
import streamRoutes from "./routes/stream";
import chatRoutes from "./routes/chat";
import listingRoutes from "./routes/listing";
import { setupWebSocket } from "./websocket";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());

// Webhook route MUST be before express.json() — it needs raw body
app.use("/api/wallet/webhook", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/streams", chatRoutes);
app.use("/api/listings", listingRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
});

const httpServer = createServer(app);
setupWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
