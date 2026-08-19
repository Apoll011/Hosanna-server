import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma.js";

export class FolderRepository {
  constructor(private readonly db: OrgScopedPrisma) {}

  findAll() {
    return this.db.folder.findMany({ where: { deleted: false }, orderBy: { name: "asc" } });
  }

  findById(id: string) {
    return this.db.folder.findUnique({ where: { id } });
  }

  create(
    data:
      | Omit<Prisma.FolderUncheckedCreateInput, "orgId">
      | Omit<Prisma.FolderCreateInput, "org" | "orgId">,
  ) {
    return this.db.folder.create({ data: data as any });
  }

  update(id: string, data: Prisma.FolderUpdateInput) {
    return this.db.folder.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.db.folder.delete({ where: { id } });
  }

  countByFolder(parentId: string | null) {
    return this.db.folder.count({ where: { parentId } });
  }

  findManyByFolder(parentId: string) {
    return this.db.folder.findMany({ where: { parentId } });
  }

  deleteManyByFolder(parentId: string) {
    return this.db.folder.deleteMany({ where: { parentId } });
  }

  moveManyToRoot(parentId: string) {
    return this.db.folder.updateMany({
      where: { parentId },
      data: { parentId: null },
    });
  }
}
