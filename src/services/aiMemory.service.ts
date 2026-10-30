import { prisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";
import {
  AI_LIMITS,
  normalizeMemoryContent,
  type AiMemoryEntry,
} from "./aiBehavior.js";

export type AiMemoryRow = AiMemoryEntry & {
  source: string;
  createdAt: Date;
};

export class AiMemoryService {
  async list(orgId: string): Promise<AiMemoryRow[]> {
    return prisma.orgAiMemory.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, source: true, createdAt: true },
    });
  }

  async add(
    orgId: string,
    content: string,
    meta: { source: "admin" | "ai"; userId?: string },
  ): Promise<AiMemoryRow & { duplicate: boolean }> {
    const text = normalizeMemoryContent(content);
    if (!text) throw AppError.badRequest("Memory entry is empty.");

    const existing = await this.list(orgId);
    const dupe = existing.find(
      (e) => e.content.toLowerCase() === text.toLowerCase(),
    );
    if (dupe) return { ...dupe, duplicate: true };
    if (existing.length >= AI_LIMITS.memoryMaxEntries) {
      throw AppError.badRequest(
        `Memory is full (${AI_LIMITS.memoryMaxEntries} entries). Forget one first.`,
      );
    }
    const row = await prisma.orgAiMemory.create({
      data: {
        orgId,
        content: text,
        source: meta.source,
        createdBy: meta.userId ?? null,
      },
      select: { id: true, content: true, source: true, createdAt: true },
    });
    return { ...row, duplicate: false };
  }

  async remove(orgId: string, id: string): Promise<boolean> {
    const res = await prisma.orgAiMemory.deleteMany({ where: { id, orgId } });
    return res.count > 0;
  }

  async clear(orgId: string): Promise<number> {
    const res = await prisma.orgAiMemory.deleteMany({ where: { orgId } });
    return res.count;
  }
}
