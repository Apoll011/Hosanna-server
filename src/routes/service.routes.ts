import { Router } from "express";
import {
  authenticateAdmin,
  authenticateAny,
  requireServiceAccess,
} from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ServiceService } from "../services/service.service";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common.validators";
import {
  archiveSchema,
  createServiceSchema,
  serviceListSchema,
  updateServiceElementsSchema,
  updateServiceSchema,
} from "../validators/service.validators";

export const serviceRouter = Router();
const byId = requireServiceAccess((req) => req.params.id);

// GET /api/services — admin or musician
serviceRouter.get(
  "/",
  authenticateAny,
  validate({ query: serviceListSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    res.json(await service.list(req.query as any));
  }),
);

// GET /api/services/:id — admin or musician
serviceRouter.get(
  "/:id",
  authenticateAny,
  validate({ params: idParamSchema }),
  byId,
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    res.json(await service.getByIdSerialized(req.params.id));
  }),
);

// POST /api/services — admin only
serviceRouter.post(
  "/",
  authenticateAdmin,
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    res.status(201).json(await service.create(req.body));
  }),
);

// PUT /api/services/:id — admin only, optimistic concurrency
serviceRouter.put(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    const { updatedAt, ...patch } = req.body;
    res.json(await service.update(req.params.id, updatedAt, patch));
  }),
);

serviceRouter.put(
  "/:id/archive",
  authenticateAdmin,
  validate({ params: idParamSchema, body: archiveSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    const { updatedAt, archive } = req.body;
    res.json(await service.archive(req.params.id, updatedAt, archive));
  }),
);

// DELETE /api/services/:id — admin only
serviceRouter.delete(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    await service.delete(req.params.id);
    res.status(204).send();
  }),
);

// PUT /api/services/:id/elements — admin OR musician (scoped). Updates the service-level modular elements.
serviceRouter.put(
  "/:id/elements",
  authenticateAny,
  validate({ params: idParamSchema, body: updateServiceElementsSchema }),
  byId,
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.tenantId!);
    const { updatedAt, elements } = req.body;
    res.json(await service.updateElements(req.params.id, updatedAt, elements));
  }),
);
