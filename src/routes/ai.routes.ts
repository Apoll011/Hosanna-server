import { Router } from "express";
import type { UIMessage } from "ai";
import { requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { authInfoFromRequest } from "../mcp/authFromRequest.js";
import {
  requirePermission as requireMcpPermission,
  requireWriteEntitlement,
  services as serviceService,
  songs as songService,
} from "../mcp/context.js";
import {
  deleteAgendaEvent,
  deleteCollection,
  deleteFolder,
} from "../mcp/lib/libraryCrud.js";
import {
  AiChatService,
  describeChatError,
} from "../services/aiChat.service.js";
import { OrgAiConfigService } from "../services/orgAiConfig.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { AiMemoryService } from "../services/aiMemory.service.js";
import {
  addAiMemorySchema,
  aiChatBodySchema,
  aiConfirmActionSchema,
  updateAiSettingsSchema,
} from "../validators/ai.validators.js";

export const aiRouter = Router();
const settings = new OrgAiConfigService();
const chat = new AiChatService();
const memory = new AiMemoryService();

aiRouter.get(
  "/settings",
  requirePermission("ai.use"),
  asyncHandler(async (req, res) => {
    const data = await settings.getPublic(req.orgId!);
    res.json(data);
  }),
);

aiRouter.put(
  "/settings",
  requirePermission("ai.manage"),
  validate({ body: updateAiSettingsSchema }),
  asyncHandler(async (req, res) => {
    const data = await settings.upsert(req.orgId!, req.body);
    res.json(data);
  }),
);

aiRouter.delete(
  "/settings/key",
  requirePermission("ai.manage"),
  asyncHandler(async (req, res) => {
    const data = await settings.clearKey(req.orgId!);
    res.json(data);
  }),
);

aiRouter.get(
  "/memory",
  requirePermission("ai.use"),
  asyncHandler(async (req, res) => {
    res.json({ items: await memory.list(req.orgId!) });
  }),
);

aiRouter.post(
  "/memory",
  requirePermission("ai.manage"),
  validate({ body: addAiMemorySchema }),
  asyncHandler(async (req, res) => {
    const item = await memory.add(req.orgId!, req.body.content, {
      source: "admin",
      userId: req.user?.id,
    });
    res.status(item.duplicate ? 200 : 201).json(item);
  }),
);

aiRouter.delete(
  "/memory/:id",
  requirePermission("ai.manage"),
  asyncHandler(async (req, res) => {
    const removed = await memory.remove(req.orgId!, String(req.params.id));
    if (!removed)
      throw new AppError(404, "VALIDATION_ERROR", "Memory entry not found");
    res.status(204).end();
  }),
);

aiRouter.delete(
  "/memory",
  requirePermission("ai.manage"),
  asyncHandler(async (req, res) => {
    const cleared = await memory.clear(req.orgId!);
    res.json({ cleared });
  }),
);

aiRouter.post(
  "/confirm",
  requirePermission("ai.use"),
  validate({ body: aiConfirmActionSchema }),
  asyncHandler(async (req, res) => {
    if (!req.orgId || !req.user) {
      throw AppError.unauthorized("Authentication required");
    }
    const { authInfo, ctx } = await authInfoFromRequest(req);
    void authInfo;
    const body = req.body as {
      action:
        | "delete_song"
        | "delete_service"
        | "delete_folder"
        | "delete_collection"
        | "delete_agenda";
      id: string;
      folderAction?: "move_to_root" | "delete_songs";
    };

    switch (body.action) {
      case "delete_song": {
        requireMcpPermission(ctx, "song.delete");
        requireWriteEntitlement(ctx);
        await songService(ctx).delete(body.id);
        return res.json({ confirmed: true, action: body.action, id: body.id });
      }
      case "delete_service": {
        requireMcpPermission(ctx, "service.delete");
        requireWriteEntitlement(ctx);
        await serviceService(ctx).delete(body.id);
        return res.json({ confirmed: true, action: body.action, id: body.id });
      }
      case "delete_folder": {
        await deleteFolder(ctx, {
          folderId: body.id,
          action: body.folderAction ?? "move_to_root",
        });
        return res.json({
          confirmed: true,
          action: body.action,
          id: body.id,
          folderAction: body.folderAction ?? "move_to_root",
        });
      }
      case "delete_collection": {
        await deleteCollection(ctx, body.id);
        return res.json({ confirmed: true, action: body.action, id: body.id });
      }
      case "delete_agenda": {
        await deleteAgendaEvent(ctx, body.id);
        return res.json({ confirmed: true, action: body.action, id: body.id });
      }
      default:
        throw AppError.badRequest("Unsupported confirmation action");
    }
  }),
);

aiRouter.post(
  "/chat",
  requirePermission("ai.use"),
  validate({ body: aiChatBodySchema }),
  asyncHandler(async (req, res) => {
    if (!req.orgId || !req.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const { authInfo } = await authInfoFromRequest(req);
    const messages = req.body.messages as UIMessage[];

    // Stop the model + tools as soon as the client goes away (Stop button,
    // closed tab) instead of burning tokens on an unread stream.
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });

    const startedAt = Date.now();
    const { model, result, budget } = await chat.streamChat({
      orgId: req.orgId,
      authInfo,
      messages,
      pageContext: req.body.context,
      locale: req.body.locale,
      abortSignal: abort.signal,
    });

    // UI message stream compatible with @ai-sdk/react useChat
    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      sendReasoning: true,
      onError: (error) => {
        if (!abort.signal.aborted)
          console.error("AI chat stream error:", error);
        return describeChatError(error);
      },
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { model: model.id, provider: model.provider };
        }
        if (part.type === "finish") {
          return {
            finishReason: part.finishReason,
            // Tool budget used up (the model was told to wrap up) or the
            // step safety net hit while it still wanted tools.
            truncated:
              budget.limitReached || part.finishReason === "tool-calls",
            toolCalls: budget.used,
            toolLimit: budget.max,
            limitReached: budget.limitReached,
            durationMs: Date.now() - startedAt,
            usage: {
              inputTokens: part.totalUsage.inputTokens,
              outputTokens: part.totalUsage.outputTokens,
            },
          };
        }
        return undefined;
      },
    });

    // Pipe Web Response → Express
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    res.on("close", () => {
      reader.cancel().catch(() => undefined);
    });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      if (abort.signal.aborted) return;
      if (!res.headersSent) throw err;
      res.end();
    }
  }),
);
