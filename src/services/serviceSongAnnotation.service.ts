// src/services/serviceSongAnnotation.service.ts

import { OrgScopedPrisma } from "../database/prisma.js";
import { supabase } from "../lib/supabase.js";

export class ServiceSongAnnotationService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly orgId: string,
    private readonly userId: string,
  ) {}

  async get(serviceId: string, songId: string) {
    return this.db.serviceSongAnnotation.findFirst({
      where: { serviceId, songId },
    });
  }

  async upsert(params: {
    serviceId: string;
    songId: string;
    canvasData: Buffer;
  }) {
    const { serviceId, songId, canvasData } = params;

    const service = await this.db.service.findFirst({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!service) throw new Error("Service not found in this organization");

    const canvasBytes = new Uint8Array(canvasData);

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

    await supabase
      .channel(`annotation:${serviceId}:${songId}`)
      .send({ type: "broadcast", event: "updated", payload: {} });

    return row;
  }
}
