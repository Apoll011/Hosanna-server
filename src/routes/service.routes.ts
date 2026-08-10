import { Router } from "express";
import { requirePermission } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ServiceService } from "../services/service.service";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common.validators";
import {
  createServiceSchema,
  serviceListSchema,
  updateServiceElementsSchema,
  updateServiceSchema,
} from "../validators/service.validators";

export const serviceRouter = Router();

serviceRouter.get(
  "/",
  requirePermission("service.access"),
  validate({ query: serviceListSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    res.json(await service.list(req.query as any));
  }),
);

serviceRouter.get(
  "/:id",
  requirePermission("service.access"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    res.json(await service.getByIdSerialized(req.params.id));
  }),
);

serviceRouter.post(
  "/",
  requirePermission("service.create"),
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    res.status(201).json(await service.create(req.body));
  }),
);

serviceRouter.put(
  "/:id",
  requirePermission("service.update"),
  validate({ params: idParamSchema, body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    const { updatedAt, ...patch } = req.body;
    res.json(await service.update(req.params.id, updatedAt, patch));
  }),
);

serviceRouter.delete(
  "/:id",
  requirePermission("service.delete"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    await service.delete(req.params.id);
    res.status(204).send();
  }),
);

serviceRouter.put(
  "/:id/elements",
  requirePermission("service.update"),
  validate({ params: idParamSchema, body: updateServiceElementsSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!);
    const { updatedAt, elements } = req.body;
    res.json(await service.updateElements(req.params.id, updatedAt, elements));
  }),
);
