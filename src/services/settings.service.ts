import { SettingsRepository } from '../repositories/settings.repository';
import type { TenantPrisma } from '../database/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';

export class SettingsService {
  private repo: SettingsRepository;

  constructor(db: TenantPrisma, tenantId: string) {
    this.repo = new SettingsRepository(db, tenantId);
  }

  async get() {
    const settings = await this.repo.get();
    if (!settings) throw AppError.notFound('SETTINGS_NOT_FOUND', 'Settings not initialized for this tenant.');
    return settings;
  }

  update(patch: Prisma.SettingsUpdateInput) {
    return this.repo.upsert(patch);
  }
}
