import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma } from "../database/prisma";
import {
  ServiceRepository,
  ServiceWithSongs,
} from "../repositories/service.repository";
import { SongRepository } from "../repositories/song.repository";
import { AppError } from "../utils/errors";
import { syncCache } from "./syncCache.service";

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict(
      "This service was modified by someone else since you last loaded it.",
    );
  }
}

function serialize(service: NonNullable<ServiceWithSongs>) {
  return {
    id: service.id,
    name: service.name,
    date: service.date,
    notes: service.notes ?? "",
    elements: service.elements ?? [],
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

export class ServiceService {
  private serviceRepo: ServiceRepository;
  private songRepo: SongRepository;

  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
  ) {
    this.serviceRepo = new ServiceRepository(db);
    this.songRepo = new SongRepository(db);
  }

  invalidateCache() {
    syncCache.invalidate(this.tenantId);
  }

  async list(body: { archived: boolean }) {
    const services = await this.serviceRepo.findAll(body.archived);
    return services.map(serialize);
  }

  async getById(id: string) {
    const service = await this.serviceRepo.findById(id);
    if (!service)
      throw AppError.notFound("SERVICE_NOT_FOUND", "Service does not exist.");
    return service;
  }

  async getByIdSerialized(id: string) {
    return serialize(await this.getById(id));
  }

  async create(input: {
    name: string;
    date: Date;
    notes?: string;
    elements?: any;
  }) {
    const created = await this.serviceRepo.create({
      id: uuid(),
      name: input.name,
      date: input.date,
      notes: input.notes ?? "",
      elements: input.elements ?? [],
    });
    this.invalidateCache();
    return serialize(created!);
  }

  async update(
    id: string,
    updatedAt: Date,
    patch: {
      name?: string;
      date?: Date;
      notes?: string;
      elements?: any;
      archived?: boolean;
    },
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    await this.serviceRepo.update(id, {
      name: patch.name ?? undefined,
      date: patch.date ?? undefined,
      notes: patch.notes ?? undefined,
      archived: patch.archived ?? undefined,
      elements: patch.elements !== undefined ? patch.elements : undefined,
    });

    this.invalidateCache();

    return serialize((await this.getById(id))!);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.serviceRepo.delete(id);
    this.invalidateCache();
  }

  async updateElements(id: string, updatedAt: Date, elements: any) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);
    const updated = await this.serviceRepo.update(id, { elements });
    this.invalidateCache();

    return serialize(updated!);
  }
}
