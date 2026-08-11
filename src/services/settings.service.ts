import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { SettingsRepository } from "../repositories/settings.repository.js";
import { AppError } from "../utils/errors.js";
import { notifyOrg } from "../utils/notify.js";
import { syncCache } from "./syncCache.service.js";

export class SettingsService {
  private repo: SettingsRepository;

  constructor(
    db: OrgScopedPrisma,
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

  async update(patch: Prisma.SettingsUpdateInput) {
    syncCache.invalidate(this.tenantId);

    const result = await this.repo.upsert(patch);

    // Security notification: settings changes (e.g. publicRead, thresholds)
    // are admin-only actions that owners should always be aware of.
    void notifyOrg({
      organizationId: this.tenantId,
      roles: ["owner", "admin"],
      type: "settings.changed",
      title: "Organization settings updated",
      description: "An admin changed one or more workspace settings.",
      // TODO: add href
    });

    return result;
  }
}
