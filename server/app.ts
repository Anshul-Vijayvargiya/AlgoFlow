import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import problemRoutes from './routes/problemRoutes';
import noteRoutes from './routes/noteRoutes';
import progressRoutes from './routes/progressRoutes';
import adminRoutes from './routes/adminRoutes';
import userRoutes from './routes/userRoutes';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { validateOrigin } from './middleware/originCheck';

export const app = express();

// Express and its dependencies switch off development behaviour only for 'production'; staging must match.
app.set('env', env.isStrict ? 'production' : env.NODE_ENV);

// Proxy Trust Configuration
// In containerized or reverse-proxied deployments (AWS ALB, Cloudflare, Nginx),
// configure TRUST_PROXY to the expected hop count (e.g. '1' or 'loopback')
if (env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
} else if (env.TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else {
  const hopCount = parseInt(env.TRUST_PROXY, 10);
  app.set('trust proxy', isNaN(hopCount) ? env.TRUST_PROXY : hopCount);
}

// Security & Parsing Middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.COOKIE_SECRET));

// CSRF Defense: Origin validation on state-changing API mutations
app.use('/api', validateOrigin);

// Rate Limiting for general APIs
app.use('/api/', apiRateLimiter);


// Health Check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route Mounts
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

// Centralized Error Handler
app.use(errorHandler);
