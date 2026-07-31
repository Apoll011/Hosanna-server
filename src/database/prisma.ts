import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.HOSANA_DB_PRISMA_DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

const TENANT_SCOPED_MODELS = new Set([
  "Admin",
  "Folder",
  "Song",
  "Service",
  "MusicianToken",
  "Settings",
]);

export function forTenant<T extends { $extends: typeof prisma.$extends }>(
  tenantId: string,
  db: T = prisma as unknown as T,
) {
  return db.$extends({
    name: `tenant-scope`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "updateMany":
            case "deleteMany":
            case "count":
            case "aggregate":
            case "groupBy": {
              (args as any).where = {
                ...((args as any).where ?? {}),
                tenantId,
              };
              return query(args);
            }

            case "update":
            case "delete": {
              (args as any).where = { ...(args as any).where, tenantId };
              return query(args);
            }

            case "upsert": {
              (args as any).where = { ...(args as any).where, tenantId };
              (args as any).create = { ...(args as any).create, tenantId };
              return query(args);
            }

            case "create": {
              (args as any).data = { ...(args as any).data, tenantId };
              return query(args);
            }

            case "createMany": {
              const data = (args as any).data;
              (args as any).data = Array.isArray(data)
                ? data.map((d: any) => ({ ...d, tenantId }))
                : { ...data, tenantId };
              return query(args);
            }

            default:
              return query(args);
          }
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof forTenant>;

export { prisma };
