import { OrgScopedPrisma } from "../database/prisma.js";

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
      /** BCP-47 locale resolved from the active organisation's settings. */
      locale: string;
    }
  }
}

export {};
