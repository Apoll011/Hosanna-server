import { prisma } from '../database/prisma';
import { hashPassword } from '../utils/password';
import { AppError } from '../utils/errors';

export class TenantService {
  async register(input: {
    tenantName: string;
    tenantSlug: string;
    adminEmail: string;
    adminPassword: string;
    adminName: string;
  }) {
    const [slugTaken, emailTaken] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: input.tenantSlug } }),
      prisma.admin.findUnique({ where: { email: input.adminEmail } }),
    ]);
    if (slugTaken) throw AppError.badRequest('That slug is already taken.');
    if (emailTaken) throw AppError.badRequest('An account with this email already exists.');

    try {
      return await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: input.tenantName, slug: input.tenantSlug } });
        await tx.settings.create({ data: { tenantId: tenant.id } });
        await tx.admin.create({
          data: {
            tenantId: tenant.id,
            email: input.adminEmail,
            passwordHash: await hashPassword(input.adminPassword),
            name: input.adminName,
            role: 'admin',
          },
        });
        return tenant;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw AppError.badRequest('A tenant or email with these details already exists.');
      }
      throw err;
    }
  }
}
