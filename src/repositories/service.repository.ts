import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma.js";

export class ServiceRepository {
  constructor(private readonly db: OrgScopedPrisma) {}

  findAll(archived: boolean) {
    return this.db.service.findMany({
      where: { archived, deleted: false },
      orderBy: { date: "asc" },
    });
  }

  findById(id: string) {
    return this.db.service.findUnique({ where: { id } });
  }

  countByIds(ids: string[]) {
    return this.db.service.count({ where: { id: { in: ids } } });
  }

  create(
    data:
      | Omit<Prisma.ServiceUncheckedCreateInput, "orgId">
      | Omit<Prisma.ServiceCreateInput, "org" | "orgId">,
  ) {
    return this.db.service.create({ data: data as any });
  }

  update(id: string, data: Prisma.ServiceUpdateInput) {
    return this.db.service.update({ where: { id }, data });
  }

  touch(id: string) {
    return this.db.service.update({ where: { id }, data: {} });
  }

  delete(id: string) {
    return this.db.service.delete({ where: { id } });
  }
}

export type ServiceWithSongs = Prisma.PromiseReturnType<
  InstanceType<typeof ServiceRepository>["findById"]
>;
