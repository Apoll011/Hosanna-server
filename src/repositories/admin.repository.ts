import { prisma } from '../database/prisma';

export const adminRepository = {
  findByEmail(email: string) {
    return prisma.admin.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.admin.findUnique({ where: { id } });
  },
};
