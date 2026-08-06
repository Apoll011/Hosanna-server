import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

const app = express();

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Demasiados pedidos. Por favor, tente novamente mais tarde.",
  },
  skip: () => env.nodeEnv !== "production",
});

app.set("trust proxy", 1);

app.use(
  helmet({
    hsts:
      env.nodeEnv === "production"
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
  }),
);

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
  if (env.nodeEnv === "production" && !req.secure) {
    return res.redirect(301, `https://${req.header("host")}${req.url}`);
  }
  next();
});

app.use("/api", globalLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `Hosanna API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`,
  );
});
