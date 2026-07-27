import type { TenantPrisma } from '../database/prisma';

export class AdminRepository {
  constructor(private readonly db: TenantPrisma) {}

  findByEmail(email: string) {
    return this.db.admin.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.db.admin.findUnique({ where: { id } });
  }
}
