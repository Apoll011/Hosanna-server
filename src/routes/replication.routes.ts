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
import { can } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  ALL_COLLECTIONS,
  ReplicatedCollection,
  ReplicationService,
} from "../services/replication.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import {
  collectionParamSchema,
  PullAllBody,
  pullAllBodySchema,
  pullBodySchema,
  pushBodySchema,
} from "../validators/replication.validators.js";

export const replicationRouter = Router();

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

replicationRouter.post(
  "/pull",
  validate({ body: pullAllBodySchema }),
  asyncHandler(async (req, res) => {
    const { checkpoints, limit } = req.body as PullAllBody;

    const requestedCollections = Object.keys(checkpoints).length
      ? (Object.keys(checkpoints) as ReplicatedCollection[])
      : ALL_COLLECTIONS;

    // Check permission for every requested collection up front
    for (const collection of requestedCollections) {
      const permKey = PULL_PERMISSIONS[collection];
      if (!permKey)
        throw AppError.badRequest(`Invalid collection: ${collection}`);
      if (!req.user || !can(req.user, permKey as any)) {
        throw AppError.forbidden();
      }
    }

    const service = new ReplicationService(req.db!, req.orgId!);
    const result = await service.pullAll({ checkpoints, limit });

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
