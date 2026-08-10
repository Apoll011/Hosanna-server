import { OrgScopedPrisma } from "../database/prisma";

export interface AuthorizedUser {
  id: string;
  workspaceId: string;
  role: AppRole;
  teamId?: string;
}

declare global {
  namespace Express {
    interface Request {
      orgId?: string; //same as workspaceId
      db?: OrgScopedPrisma;
      user?: AuthorizedUser;
    }
  }
}

export {};
