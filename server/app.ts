import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import apiRoutes from './routes/api.routes.js';
import { validateEnvironment } from './config/env.js';
import { logger } from './lib/logger.js';

dotenv.config();
validateEnvironment();

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Static uploads (payment receipts, etc). Helmet CSP disabled above so
// inline-styled HTML receipts render correctly in the browser.
const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, { fallthrough: true, maxAge: '1d' }));

// Health / readiness check — sin auth, para orquestación y monitoreo.
const healthHandler = (_req: express.Request, res: express.Response) =>
  res.json({ status: 'ok', service: 'pagacuotas-api', uptime: process.uptime() });
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Routes
app.use('/api', apiRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled API error', {
    path: req.path,
    method: req.method,
    error: err,
  });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: err.details || null,
  });
});

export default app;
