import { settingsRepository } from '../repositories/settings.repository';

export const settingsService = {
  get() {
    return settingsRepository.get();
  },

  update(patch: Partial<{
    serverName: string;
    defaultKey: string;
    syncIntervalSeconds: number;
    allowPublicRead: boolean;
    autoBackupEnabled: boolean;
    maxUploadMB: number;
  }>) {
    return settingsRepository.update(patch);
  },
};
