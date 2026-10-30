import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { Router, type Request, type Response, type NextFunction } from "express";
import { mcpAuthMiddleware } from "./context.js";
import { createHosannaMcpServer } from "./server.js";

/**
 * Stateless Streamable HTTP MCP endpoint.
 * Auth is optional for ChordPro tools; song/service tools require Bearer session.
 * `req.auth` is set by mcpAuthMiddleware and forwarded by toNodeHandler.
 */
const mcpHandler = createMcpHandler(
  ({ authInfo }) => createHosannaMcpServer(authInfo),
  { responseMode: "json" },
);

const nodeHandler = toNodeHandler(mcpHandler);

export const mcpRouter = Router();

mcpRouter.use(mcpAuthMiddleware);

mcpRouter.all("/", (req: Request, res: Response, next: NextFunction) => {
  void nodeHandler(req, res, req.body).catch(next);
});

export { mcpHandler };
