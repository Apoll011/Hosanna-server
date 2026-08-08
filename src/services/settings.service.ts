import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../database/prisma";
import { SettingsRepository } from "../repositories/settings.repository";
import { AppError } from "../utils/errors";
import { syncCache } from "./syncCache.service";

export class SettingsService {
  private repo: SettingsRepository;

  constructor(
    db: TenantPrisma,
    private readonly tenantId: string,
  ) {
    this.repo = new SettingsRepository(db, tenantId);
  }

  async get() {
    const settings = await this.repo.get();
    if (!settings)
      throw AppError.notFound(
        "SETTINGS_NOT_FOUND",
        "Settings not initialized for this tenant.",
      );
    return settings;
  }

  update(patch: Prisma.SettingsUpdateInput) {
    syncCache.invalidate(this.tenantId);

    return this.repo.upsert(patch);
  }
}
