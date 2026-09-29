import { Request, Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ServiceNoteService } from "../services/serviceNote.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createServiceNoteSchema,
  listServiceNotesQuerySchema,
  serviceIdParamsSchema,
  serviceNoteParamsSchema,
  updateServiceNoteSchema,
} from "../validators/serviceNote.validators.js";

/**
 * Notes on a worship service. Not part of replication.
 *
 *   GET    /api/services/:id/notes
 *   GET    /api/services/:id/notes?elementId=:elementId
 *   GET    /api/services/:id/notes?scope=service
 *   POST   /api/services/:id/notes
 *   PUT    /api/services/:id/notes/:noteId
 *   DELETE /api/services/:id/notes/:noteId
 *
 * A null elementId attaches the note to the service. A private note is
 * returned only to its author. The `notes` string inside each element is
 * unrelated and is left unchanged.
 */
export const serviceNoteRouter = Router({ mergeParams: true });

function notesOf(req: Request) {
  return new ServiceNoteService(req.db!, req.user!.id, req.locale);
}

serviceNoteRouter.get(
  "/",
  requirePermission("service.access"),
  validate({
    params: serviceIdParamsSchema,
    query: listServiceNotesQuerySchema,
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as {
      elementId?: string;
      scope: "all" | "service";
    };
    const elementId = query.scope === "service" ? null : query.elementId;
    res.json(await notesOf(req).list(req.params.id, elementId));
  }),
);

serviceNoteRouter.post(
  "/",
  requirePermission("service.access"),
  validate({ params: serviceIdParamsSchema, body: createServiceNoteSchema }),
  asyncHandler(async (req, res) => {
    const created = await notesOf(req).create(req.params.id, req.body);
    res.status(201).json(created);
  }),
);

serviceNoteRouter.put(
  "/:noteId",
  requirePermission("service.access"),
  validate({
    params: serviceNoteParamsSchema,
    body: updateServiceNoteSchema,
  }),
  asyncHandler(async (req, res) => {
    res.json(
      await notesOf(req).update(req.params.id, req.params.noteId, req.body),
    );
  }),
);

serviceNoteRouter.delete(
  "/:noteId",
  requirePermission("service.access"),
  validate({ params: serviceNoteParamsSchema }),
  asyncHandler(async (req, res) => {
    await notesOf(req).delete(req.params.id, req.params.noteId);
    res.status(204).send();
  }),
);
