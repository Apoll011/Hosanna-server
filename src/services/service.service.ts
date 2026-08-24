import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import {
  ServiceRepository,
  ServiceWithSongs,
} from "../repositories/service.repository.js";
import { SongRepository } from "../repositories/song.repository.js";
import { AppError } from "../utils/errors.js";
import { syncCache } from "./syncCache.service.js";

function assertUnchanged(
  current: { updatedAt: Date },
  clientUpdatedAt: Date,
  locale: string,
) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict(t(locale, "conflict.service"));
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
    private readonly locale: string = DEFAULT_LOCALE,
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
    if (!service || service.deleted)
      throw AppError.notFound(
        "SERVICE_NOT_FOUND",
        t(this.locale, "service.not_found"),
      );
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
    assertUnchanged(current, updatedAt, this.locale);

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
    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.serviceRepo.update(id, { deleted: true, purgeAt });
    this.invalidateCache();
  }

  async restore(id: string) {
    const service = await this.serviceRepo.findById(id);
    if (!service || !service.deleted)
      throw AppError.notFound("SERVICE_NOT_FOUND", t(this.locale, "service.not_found"));
    await this.serviceRepo.update(id, { deleted: false, purgeAt: null });
    this.invalidateCache();
    return serialize((await this.serviceRepo.findById(id))!);
  }

  async listTrashed() {
    const services = await this.serviceRepo.findTrashed();
    return services.map(serialize);
  }

  async updateElements(id: string, updatedAt: Date, elements: any) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt, this.locale);
    const updated = await this.serviceRepo.update(id, { elements });
    this.invalidateCache();

    return serialize(updated!);
  }
}
