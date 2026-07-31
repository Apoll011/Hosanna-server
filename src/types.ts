import { prisma } from "./database/prisma";

export type PrismaTransactionalClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];
