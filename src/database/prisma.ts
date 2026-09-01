import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ORG_SCOPED_MODELS = new Set([
  "Folder",
  "Song",
  "Service",
  "AgendaEvent",
  "Settings",
]);

export function forOrganization<T extends { $extends: typeof prisma.$extends }>(
  orgId: string,
  db: T = prisma as unknown as T,
) {
  return db.$extends({
    name: `tenant-scope`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !ORG_SCOPED_MODELS.has(model)) {
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
                orgId,
              };
              return query(args);
            }

            case "update":
            case "delete": {
              (args as any).where = { ...(args as any).where, orgId };
              return query(args);
            }

            case "upsert": {
              (args as any).where = { ...(args as any).where, orgId };
              (args as any).create = {
                ...(args as any).create,
                orgId,
              };
              return query(args);
            }

            case "create": {
              (args as any).data = { ...(args as any).data, orgId };
              return query(args);
            }

            case "createMany": {
              const data = (args as any).data;
              (args as any).data = Array.isArray(data)
                ? data.map((d: any) => ({ ...d, orgId }))
                : { ...data, orgId };
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

export type OrgScopedPrisma = ReturnType<typeof forOrganization>;
export type OrgScopedTx = Parameters<
  Parameters<OrgScopedPrisma["$transaction"]>[0]
>[0];

export { prisma };
