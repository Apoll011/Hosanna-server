import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import { SettingsRepository } from "../repositories/settings.repository.js";
import { AppError } from "../utils/errors.js";
import { notifyOrg } from "../utils/notify.js";
import { syncCache } from "./syncCache.service.js";

export class SettingsService {
  private repo: SettingsRepository;

  constructor(
    db: OrgScopedPrisma,
    private readonly tenantId: string,
    private readonly locale: string = DEFAULT_LOCALE,
  ) {
    this.repo = new SettingsRepository(db, tenantId);
  }

  async get() {
    const settings = await this.repo.get();
    if (!settings)
      throw AppError.notFound(
        "SETTINGS_NOT_FOUND",
        t(this.locale, "settings.not_found"),
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
      title: t(this.locale, "notification.settings_changed_title"),
      description: t(this.locale, "notification.settings_changed_description"),
      // TODO: add href
    });

    return result;
  }
}
