import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { createServer } from "http";
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallet";
import webhookRoutes from "./routes/webhook";
import streamRoutes from "./routes/stream";
import chatRoutes from "./routes/chat";
import breakRoutes from "./routes/break";
import earningsRoutes from "./routes/earnings";
import orderRoutes from "./routes/order";
import { setupWebSocket } from "./websocket";
import logger from "./lib/logger";
import { connectRedis } from "./lib/redis";
import { startWorkers } from "./workers";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

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
app.use("/api/breaks", breakRoutes);
app.use("/api/seller", earningsRoutes);
app.use("/api/orders", orderRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
});

const httpServer = createServer(app);

async function bootstrap() {
  try {
    await connectRedis();
  } catch (err) {
    logger.fatal(
      err,
      `Redis is not reachable at ${process.env.REDIS_URL || "redis://localhost:6379"}. From the repo root run: docker compose up -d redis`
    );
    process.exit(1);
  }

  await setupWebSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    startWorkers().catch((e) => logger.warn(e, "Failed to start workers"));
  });
}

bootstrap().catch((err) => {
  logger.fatal(err, "Server failed to start");
  process.exit(1);
});
