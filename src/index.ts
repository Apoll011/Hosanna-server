import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// This project's only responsibility is the REST API — no frontend assets
// are served here. The dashboard is a fully separate, independently
// deployed project that talks to this server over HTTP.
app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, '0.0.0.0', () => {
  console.log(`Hosanna Studio API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
});
