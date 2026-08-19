/**
 * RxDB Replication Routes
 *
 * Provides pull and push endpoints for RxDB HTTP replication for three
 * collections: songs, folders, services.
 *
 * Pull:  POST /api/replication/:collection/pull
 * Push:  POST /api/replication/:collection/push
 *
 * Both endpoints require authentication. The organisation (tenant) is
 * always derived from the authenticated session, never from the client.
 */

import { Router } from "express";
import { z } from "zod";
import { can } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  ReplicatedCollection,
  ReplicationService,
} from "../services/replication.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";

export const replicationRouter = Router();

// ── Validators ─────────────────────────────────────────────────────────────

const collectionParamSchema = z.object({
  collection: z.enum(["songs", "folders", "services"]),
});

const pullBodySchema = z.object({
  checkpoint: z
    .object({
      updatedAt: z.number(),
      id: z.string(),
    })
    .nullable()
    .optional()
    .default(null),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

const changeRowSchema = z.object({
  newDocumentState: z.record(z.unknown()),
  assumedMasterState: z.record(z.unknown()).nullable().optional(),
});

const pushBodySchema = z.object({
  changeRows: z.array(changeRowSchema).min(1).max(100),
});

// ── Permission map ─────────────────────────────────────────────────────────

const PULL_PERMISSIONS: Record<ReplicatedCollection, string> = {
  songs: "song.access",
  folders: "folder.access",
  services: "service.access",
};

const PUSH_PERMISSIONS: Record<ReplicatedCollection, string> = {
  songs: "song.create",
  folders: "folder.create",
  services: "service.create",
};

// ── Pull endpoint ──────────────────────────────────────────────────────────

replicationRouter.post(
  "/:collection/pull",
  validate({ params: collectionParamSchema, body: pullBodySchema }),
  asyncHandler(async (req, res) => {
    const collection = req.params.collection as ReplicatedCollection;

    // Dynamic permission check based on collection
    const permKey = PULL_PERMISSIONS[collection];
    if (!permKey) throw AppError.badRequest("Invalid collection.");

    if (!req.user || !can(req.user, permKey as any)) {
      throw AppError.forbidden();
    }

    const service = new ReplicationService(req.db!, req.orgId!);
    const result = await service.pull(collection, {
      checkpoint: req.body.checkpoint,
      limit: req.body.limit,
    });

    res.json(result);
  }),
);

// ── Push endpoint ──────────────────────────────────────────────────────────

replicationRouter.post(
  "/:collection/push",
  validate({ params: collectionParamSchema, body: pushBodySchema }),
  asyncHandler(async (req, res) => {
    const collection = req.params.collection as ReplicatedCollection;

    const permKey = PUSH_PERMISSIONS[collection];
    if (!permKey) throw AppError.badRequest("Invalid collection.");

    if (!req.user || !can(req.user, permKey as any)) {
      throw AppError.forbidden();
    }

    const service = new ReplicationService(req.db!, req.orgId!);
    const conflicts = await service.push(collection, {
      changeRows: req.body.changeRows,
    });

    // RxDB expects an array of conflicting documents.
    // Empty array = all changes accepted.
    res.json(conflicts);
  }),
);
