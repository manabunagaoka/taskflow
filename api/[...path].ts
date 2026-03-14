import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";

// Disable Vercel's automatic body parsing so Express can handle it
export const config = {
  api: {
    bodyParser: false,
  },
};

const app = express();
const httpServer = createServer(app);

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// Debug endpoint to check what's happening
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + "...",
    nodeEnv: process.env.NODE_ENV,
  });
});

let initialized = false;

async function init() {
  if (initialized) return;
  try {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(httpServer, app);
  } catch (err: any) {
    console.error("Init error:", err);
    // Add a fallback error route so we can see what went wrong
    app.use("/api/(.*)", (_req: Request, res: Response) => {
      res.status(500).json({ error: "Server init failed", message: err.message });
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  initialized = true;
}

export default async function handler(req: Request, res: Response) {
  await init();
  app(req, res);
}
