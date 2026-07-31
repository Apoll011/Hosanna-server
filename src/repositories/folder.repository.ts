import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../database/prisma";
import { PrismaTransactionalClient } from "../types";

export class FolderRepository {
  constructor(private readonly db: TenantPrisma) {}

  findAll(db: TenantPrisma | PrismaTransactionalClient = this.db) {
    return db.folder.findMany({ orderBy: { name: "asc" } });
  }

  findById(id: string, db: TenantPrisma | PrismaTransactionalClient = this.db) {
    return db.folder.findUnique({ where: { id } });
  }

  create(
    data:
      | Omit<Prisma.FolderUncheckedCreateInput, "tenantId">
      | Omit<Prisma.FolderCreateInput, "tenant" | "tenantId">,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.create({ data: data as any });
  }

  update(
    id: string,
    data: Prisma.FolderUpdateInput,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.update({ where: { id }, data });
  }

  delete(id: string, db: TenantPrisma | PrismaTransactionalClient = this.db) {
    return db.folder.delete({ where: { id } });
  }

  countByFolder(
    parentId: string | null,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.count({ where: { parentId } });
  }

  findManyByFolder(
    parentId: string,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.findMany({ where: { parentId } });
  }

  deleteManyByFolder(
    parentId: string,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.deleteMany({ where: { parentId } });
  }

  moveManyToRoot(
    parentId: string,
    db: TenantPrisma | PrismaTransactionalClient = this.db,
  ) {
    return db.folder.updateMany({
      where: { parentId },
      data: { parentId: null },
    });
  }
}
