import { TenantPrisma } from '../database/prisma';
import { AdminJwtPayload } from '../utils/tokens';

export type AuthenticatedActor =
  | { type: 'admin'; admin: AdminJwtPayload }
  | {
      type: 'musician';
      musicianToken: {
        id: string;
        name: string;
        allowedServiceIds: string[] | null; // null = unrestricted (all services)
      };
    };

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      db?: TenantPrisma;
      actor?: AuthenticatedActor;
    }
  }
}

export {};
