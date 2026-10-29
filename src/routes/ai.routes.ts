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
import { AiChatService } from "../services/aiChat.service.js";
import { OrgAiConfigService } from "../services/orgAiConfig.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import {
  aiChatBodySchema,
  aiConfirmActionSchema,
  updateAiSettingsSchema,
} from "../validators/ai.validators.js";

export const aiRouter = Router();
const settings = new OrgAiConfigService();
const chat = new AiChatService();

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
    const result = await chat.streamChat({
      orgId: req.orgId,
      authInfo,
      messages,
      pageContext: req.body.context,
    });

    // UI message stream compatible with @ai-sdk/react useChat
    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
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
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      try {
        reader.cancel();
      } catch {
        /* ignore */
      }
      if (!res.headersSent) throw err;
      res.end();
    }
  }),
);
