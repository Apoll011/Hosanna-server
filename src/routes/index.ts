import { Router } from 'express';
import { authRouter } from './auth.routes';
import { songRouter } from './song.routes';
import { folderRouter } from './folder.routes';
import { serviceRouter } from './service.routes';
import { musicianTokenRouter } from './musicianToken.routes';
import { settingsRouter } from './settings.routes';
import { backupRouter } from './backup.routes';
import { healthRouter } from './health.routes';
import { tenantRouter } from './tenant.routes';

import { syncRouter } from './sync.routes';
import { printRouter } from './print.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/tenants', tenantRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/songs', songRouter);
apiRouter.use('/folders', folderRouter);
apiRouter.use('/services', serviceRouter);
apiRouter.use('/musicians/tokens', musicianTokenRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/backup', backupRouter);
apiRouter.use('/print', printRouter);