import type { TenantPrisma } from "../database/prisma";

export class AdminRepository {
  constructor(private readonly db: TenantPrisma) {}

  findByEmail(email: string) {
    return this.db.admin.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.db.admin.findUnique({ where: { id } });
  }

  tenant(id: string) {
    return this.db.tenant.findUnique({
      where: { id },
    });
  }

  findAll() {
    return this.db.admin.findMany({
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findPending() {
    return this.db.admin.findMany({
      where: { isApproved: false },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  approve(id: string) {
    return this.db.admin.update({
      where: { id },
      data: { isApproved: true },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  delete(id: string) {
    return this.db.admin.delete({ where: { id } });
  }
}
