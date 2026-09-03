import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../config/env.js";

const pool = new Pool({
  connectionString: env.databaseUrl,
  // Keep at most 20 open connections; tune per your DB plan.
  max: env.dbPoolMax,
  // Return idle connections to the server after 30 s.
  idleTimeoutMillis: 30_000,
  // Kill a connection that takes more than 10 s to establish.
  connectionTimeoutMillis: 10_000,
  // Let PostgreSQL kill statements that run longer than 10 s.
  statement_timeout: 10_000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ORG_SCOPED_MODELS = new Set([
  "Folder",
  "Song",
  "Service",
  "AgendaEvent",
  "Settings",
]);

// Reuse the extended client across requests for the same org.
// A plain Map is fine: the number of orgs is bounded and small.
const orgClientCache = new Map<string, ReturnType<typeof buildOrgClient>>();
const ORG_CACHE_MAX = 512;

function buildOrgClient(orgId: string) {
  return prisma.$extends({
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
              (args as any).where = { ...((args as any).where ?? {}), orgId };
              return query(args);
            }
            case "update":
            case "delete": {
              (args as any).where = { ...(args as any).where, orgId };
              return query(args);
            }
            case "upsert": {
              (args as any).where = { ...(args as any).where, orgId };
              (args as any).create = { ...(args as any).create, orgId };
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

export function forOrganization(orgId: string) {
  const cached = orgClientCache.get(orgId);
  if (cached) return cached;

  // Evict oldest entry if the cache is full (rare — bounded by org count).
  if (orgClientCache.size >= ORG_CACHE_MAX) {
    orgClientCache.delete(orgClientCache.keys().next().value!);
  }

  const client = buildOrgClient(orgId);
  orgClientCache.set(orgId, client);
  return client;
}

export type OrgScopedPrisma = ReturnType<typeof forOrganization>;
export type OrgScopedTx = Parameters<
  Parameters<OrgScopedPrisma["$transaction"]>[0]
>[0];

export { prisma };
