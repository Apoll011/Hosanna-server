import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma";

export class SettingsRepository {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly orgId: string,
  ) {}

  get() {
    return this.db.settings.findUnique({ where: { orgId: this.orgId } });
  }

  upsert(data: Prisma.SettingsUpdateInput) {
    return this.db.settings.upsert({
      where: { orgId: this.orgId },
      create: {
        ...data,
        orgId: this.orgId,
      } as Prisma.SettingsUncheckedCreateInput,
      update: data,
    });
  }
}
