import { Prisma } from '@prisma/client';
import type { TenantPrisma } from '../database/prisma';

export class SettingsRepository {
  constructor(private readonly db: TenantPrisma, private readonly tenantId: string) {}

  get() {
    return this.db.settings.findUnique({ where: { tenantId: this.tenantId } });
  }

  upsert(data: Prisma.SettingsUpdateInput) {
    return this.db.settings.upsert({
      where: { tenantId: this.tenantId },
      create: { ...data, tenantId: this.tenantId } as Prisma.SettingsUncheckedCreateInput,
      update: data,
    });
  }
}
