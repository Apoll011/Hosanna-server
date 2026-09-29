// src/services/serviceSongAnnotation.service.ts

import { OrgScopedPrisma } from "../database/prisma.js";
import {
  getAnnotationDoc,
  publishAnnotation,
  resolveAnnotationBytes,
} from "../lib/firestore.js";

export type AnnotationRecord = {
  canvasData: Buffer;
  updatedAt: Date;
  updatedById: string | null;
};

export class ServiceSongAnnotationService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly orgId: string,
    private readonly userId: string,
  ) {}

  /**
   * Prefer Firestore inline bytes when present. Large annotations are
   * metadata-only in Firestore — bytes come from Postgres.
   */
  async get(serviceId: string, songId: string): Promise<AnnotationRecord | null> {
    const firebaseDoc = await getAnnotationDoc(serviceId, songId);
    if (firebaseDoc) {
      const bytes = await resolveAnnotationBytes(firebaseDoc);
      if (bytes && bytes.byteLength > 0) {
        return {
          canvasData: bytes,
          updatedAt: new Date(firebaseDoc.updatedAt),
          updatedById: firebaseDoc.updatedById || null,
        };
      }
    }

    const row = await this.db.serviceSongAnnotation.findFirst({
      where: { serviceId, songId },
    });
    if (!row) return null;

    // If Firestore had a newer metadata ping, prefer its timestamps while
    // serving bytes from Postgres.
    const updatedAt =
      firebaseDoc != null
        ? new Date(firebaseDoc.updatedAt)
        : row.updatedAt;
    const updatedById =
      firebaseDoc?.updatedById || row.updatedById;

    return {
      canvasData: Buffer.from(row.canvasData),
      updatedAt,
      updatedById,
    };
  }

  async upsert(params: {
    serviceId: string;
    songId: string;
    canvasData: Buffer;
  }): Promise<AnnotationRecord> {
    const { serviceId, songId, canvasData } = params;

    const service = await this.db.service.findFirst({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!service) throw new Error("Service not found in this organization");

    const canvasBytes = new Uint8Array(canvasData);

    // Dual-write Postgres briefly for rollback / REST clients that still read DB.
    // Firebase is the live sync source for the Flutter app.
    const row = await this.db.serviceSongAnnotation.upsert({
      where: { serviceId_songId: { serviceId, songId } },
      create: {
        orgId: this.orgId,
        serviceId,
        songId,
        canvasData: canvasBytes,
        updatedById: this.userId,
      },
      update: { canvasData: canvasBytes, updatedById: this.userId },
    });

    const updatedAtIso = row.updatedAt.toISOString();
    const revision = row.updatedAt.getTime();

    // Supabase broadcast removed — Flutter listens on Firestore.
    // Failures are logged inside publishAnnotation (same soft-fail as notes).
    void publishAnnotation({
      orgId: this.orgId,
      serviceId,
      songId,
      canvasData,
      updatedById: this.userId,
      updatedAt: updatedAtIso,
      revision,
    });

    return {
      canvasData: Buffer.from(row.canvasData),
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }
}
