import app from './app.js';
import dotenv from 'dotenv';
import { registerOutboxHandlers, startBackgroundWorkers } from './workers/index.js';
import { logger } from './lib/logger.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

registerOutboxHandlers();

app.listen(PORT, () => {
  logger.info('PagaCuotas API running', { url: `http://localhost:${PORT}` });
  startBackgroundWorkers();
});
