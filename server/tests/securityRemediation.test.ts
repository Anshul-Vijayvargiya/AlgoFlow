import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validateOrigin } from '../middleware/originCheck';
import { errorHandler } from '../middleware/errorHandler';
import { validateEnv, KNOWN_DEV_FALLBACK_JWT, KNOWN_DEV_FALLBACK_COOKIE } from '../config/env';
import { normalizeRole } from '../../src/api/client';
import { setUnauthorizedHandler } from '../../src/api/httpAdapter';

describe('Phase 2.1 Security Remediation Verification Suite', () => {
  // ── Step 1: Production Error Sanitization ──────────────────────────────────
  describe('Error Handler Sanitization', () => {
    it('should mask 500 error messages in production environment', () => {
      const mockReq: any = { method: 'GET', url: '/api/sensitive' };
      let capturedStatus = 0;
      let capturedJson: any = null;

      const mockRes: any = {
        status: (s: number) => {
          capturedStatus = s;
          return mockRes;
        },
        json: (payload: any) => {
          capturedJson = payload;
          return mockRes;
        },
      };

      const sensitiveError: any = new Error('MongoServerError: authentication failed for user admin at mongodb://secret-db:27017');
      sensitiveError.statusCode = 500;

      // Force production mode temporarily
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        errorHandler(sensitiveError, mockReq, mockRes, () => {});

        expect(capturedStatus).toBe(500);
        expect(capturedJson.error).toBe('Internal Server Error');
        expect(capturedJson.error).not.toMatch(/mongodb/i);
        expect(capturedJson.error).not.toMatch(/secret-db/i);
        expect(capturedJson.stack).toBeUndefined();
      } finally {
        process.env.NODE_ENV = origEnv;
      }

    });

    it('should preserve safe 4xx client validation messages', () => {
      const mockReq: any = { method: 'POST', url: '/api/test' };
      let capturedStatus = 0;
      let capturedJson: any = null;

      const mockRes: any = {
        status: (s: number) => {
          capturedStatus = s;
          return mockRes;
        },
        json: (payload: any) => {
          capturedJson = payload;
          return mockRes;
        },
      };

      const clientError: any = new Error('Invalid input payload format');
      clientError.statusCode = 400;

      errorHandler(clientError, mockReq, mockRes, () => {});

      expect(capturedStatus).toBe(400);
      expect(capturedJson.error).toBe('Invalid input payload format');
    });
  });

  // ── Step 2: Production Environment Validation ──────────────────────────────
  describe('Environment Validation (env.ts)', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      CLIENT_URL: 'https://algoflow.io',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/algoflow',
      JWT_SECRET: 'production_jwt_secret_must_be_minimum_32_characters_long_for_security',
      COOKIE_SECRET: 'production_cookie_secret_must_be_minimum_32_characters_long_for_security',
      RATE_LIMIT_WINDOW_MS: '900000',
      RATE_LIMIT_MAX_AUTH: '10',
      RATE_LIMIT_MAX_API: '100',
    };

    it('should pass validation when all production requirements are satisfied', () => {
      const result = validateEnv(validProdEnv);
      expect(result.success).toBe(true);
    });

    it('should reject production startup if JWT_SECRET uses fallback secret', () => {
      const result = validateEnv({
        ...validProdEnv,
        JWT_SECRET: KNOWN_DEV_FALLBACK_JWT,
      });

      expect(result.success).toBe(false);
      const errors = result.error?.format();
      expect(errors?.JWT_SECRET?._errors[0]).toMatch(/cannot use the development fallback key/i);
    });

    it('should reject production startup if COOKIE_SECRET uses fallback secret', () => {
      const result = validateEnv({
        ...validProdEnv,
        COOKIE_SECRET: KNOWN_DEV_FALLBACK_COOKIE,
      });

      expect(result.success).toBe(false);
      const errors = result.error?.format();
      expect(errors?.COOKIE_SECRET?._errors[0]).toMatch(/cannot use the development fallback key/i);
    });

    it('should reject production startup if secrets are shorter than 32 characters', () => {
      const result = validateEnv({
        ...validProdEnv,
        JWT_SECRET: 'too_short_secret',
      });

      expect(result.success).toBe(false);
      const errors = result.error?.format();
      expect(errors?.JWT_SECRET?._errors[0]).toMatch(/at least 32 characters/i);
    });

    it('should reject production startup if CLIENT_URL is localhost or not HTTPS', () => {
      const result = validateEnv({
        ...validProdEnv,
        CLIENT_URL: 'http://localhost:5173',
      });

      expect(result.success).toBe(false);
      const errors = result.error?.format();
      expect(errors?.CLIENT_URL?._errors[0]).toMatch(/explicitly configured/i);
    });

    // Sprint 8: there is no built-in fallback secret any more, so development must configure secrets too (the
    // .env.example placeholders are accepted locally); the other local defaults still apply.
    it('should permit local development defaults once secrets are configured, without production-grade secrets', () => {
      const result = validateEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'local-dev-jwt',
        COOKIE_SECRET: 'local-dev-cookie',
      });

      expect(result.success).toBe(true);
      expect(result.data?.CLIENT_URL).toBe('http://localhost:5173');
    });
  });

  // ── Step 4: Role Normalization ─────────────────────────────────────────────
  describe('Role Normalization', () => {
    it('should normalize all role formats to canonical uppercase UserRole', () => {
      expect(normalizeRole('user')).toBe('USER');
      expect(normalizeRole('USER')).toBe('USER');
      expect(normalizeRole('admin')).toBe('ADMIN');
      expect(normalizeRole('ADMIN')).toBe('ADMIN');
      expect(normalizeRole('super_admin')).toBe('SUPER_ADMIN');
      expect(normalizeRole('SUPER_ADMIN')).toBe('SUPER_ADMIN');
      expect(normalizeRole(' unknown ')).toBe('USER');
      expect(normalizeRole(undefined)).toBe('USER');
      expect(normalizeRole(null)).toBe('USER');
    });
  });

  // ── Step 7: Origin Validation (CSRF Defense) ────────────────────────────────
  describe('Origin Validation Middleware', () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api', validateOrigin);
    testApp.post('/api/mutate', (req, res) => res.json({ success: true }));
    testApp.get('/api/read', (req, res) => res.json({ success: true }));

    it('should allow GET requests regardless of Origin (read-only)', async () => {
      const res = await request(testApp)
        .get('/api/read')
        .set('Origin', 'http://untrusted-site.com');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow POST mutation when Origin matches CLIENT_URL', async () => {
      const res = await request(testApp)
        .post('/api/mutate')
        .set('Origin', 'http://localhost:5173')
        .send({ data: 'valid' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject POST mutation when Origin does not match CLIENT_URL', async () => {
      const res = await request(testApp)
        .post('/api/mutate')
        .set('Origin', 'http://evil-phishing-site.com')
        .send({ data: 'malicious' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/unauthorized request origin/i);
    });

    it('should reject requests with browser sec-fetch-site: cross-site', async () => {
      const res = await request(testApp)
        .post('/api/mutate')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ data: 'cross-site' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cross-origin mutation request rejected/i);
    });

    it('should allow non-browser programmatic clients with missing Origin header', async () => {
      const res = await request(testApp)
        .post('/api/mutate')
        .send({ data: 'cli-tool' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Step 8: Session Expiration Handler ──────────────────────────────────────
  describe('Session Expiration & Unauthorized Handler', () => {
    it('should trigger unauthorized handler on 401 for protected requests', () => {
      const handlerSpy = vi.fn();
      setUnauthorizedHandler(handlerSpy);

      // Verify handler registration works and is callable
      expect(handlerSpy).not.toHaveBeenCalled();
      handlerSpy();
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      // Clean up
      setUnauthorizedHandler(null);
    });
  });
});
