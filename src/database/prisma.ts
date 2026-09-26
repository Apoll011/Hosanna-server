import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { env } from "../config/env.js";

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  // On Vercel Fluid, close idle connections quickly so attachDatabasePool
  // can release them before the isolate suspends. Long-running hosts keep
  // connections warmer to avoid reconnect churn.
  idleTimeoutMillis: env.isVercel ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
});

// Fluid compute: close idle pool connections before the isolate suspends,
// preventing leaked Postgres connections across freeze/thaw cycles.
if (env.isVercel) {
  attachDatabasePool(pool);
}

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ORG_SCOPED_MODELS = new Set([
  "Folder",
  "Collection",
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
