import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

const SETTINGS_ID = 'settings';

export const settingsRepository = {
  async get() {
    const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return prisma.settings.create({ data: { id: SETTINGS_ID } });
  },

  update(data: Prisma.SettingsUpdateInput) {
    return prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...(data as Prisma.SettingsCreateInput) },
    });
  },
};
