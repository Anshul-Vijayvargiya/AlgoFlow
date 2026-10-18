# Phase 1: Backend Foundation, Authentication, Database & Security Plan

## 1. Current Architecture
* **Frontend**: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + React Router 7.
* **State / Data**: Client-side Zustand stores (`useVisualizerStore`, `useAuthStore`, `usePracticeStore`, `useNotesStore`) calling `MockApiClient` (`src/api/mockAdapter.ts`) which stores state in `localStorage`.
* **Execution Engine**: `AlgorithmDefinition` → `ExecutionStep[]` → `Visualization` + `Code` + `Variables` + `Explanation` running 100% on the frontend without server dependency.
* **Backend**: None. Backend endpoints are currently simulated.

---

## 2. Proposed Architecture
* **Full Stack Decoupled Architecture**:
  * **Frontend**: Remains independent, consuming `ApiClient` via `HttpApiClient` or `MockApiClient`.
  * **Backend**: Node.js + Express + TypeScript + Mongoose (MongoDB) running on port 5000 (or `PORT` env).
* **Database Storage Segregation**:
  * **Static Application Data**: `AlgorithmDefinition`, `lineMap`, 4-language source code strings stay in frontend codebase (`src/engine/algorithms/`).
  * **Persistent User & Product Data**: Stored in MongoDB via Mongoose ORM models (`User`, `Problem`, `Submission`, `Note`, `ProgressTrack`).
* **Authentication**: Password hashing with `bcryptjs`, session JWT stored in secure `HTTP-only` cookies, stateless token validation.
* **Authorization**: Server-side Role-Based Access Control (`USER`, `ADMIN`, `SUPER_ADMIN`).

---

## 3. Files to Create

### Backend (`server/`)
1. `.env.example`: Environment variable blueprint (`PORT`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `COOKIE_SECRET`, `NODE_ENV`).
2. `server/config/env.ts`: Zod schema validating process.env on startup.
3. `server/config/db.ts`: MongoDB connection manager with graceful shutdown handlers.
4. `server/middleware/errorHandler.ts`: Centralized Express error handler (hides stack traces in production).
5. `server/middleware/auth.ts`: `requireAuth` and `requireRole("ADMIN", "SUPER_ADMIN")` authorization middleware.
6. `server/middleware/validate.ts`: Zod request body and query validator middleware.
7. `server/middleware/rateLimiter.ts`: Rate limiter abstraction (in-memory bucket with Redis adapter support).
8. `server/models/User.ts`: Mongoose schema for User (`email`, `passwordHash`, `name`, `role`, `streakDays`, `solvedCount`).
9. `server/models/Problem.ts`: Mongoose schema for PracticeProblem.
10. `server/models/Submission.ts`: Mongoose schema for Problem Submissions.
11. `server/models/Note.ts`: Mongoose schema for User Markdown Notes.
12. `server/models/ProgressTrack.ts`: Mongoose schema for Progress & Activity logs.
13. `server/routes/authRoutes.ts`: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
14. `server/routes/problemRoutes.ts`: `/api/problems`.
15. `server/routes/noteRoutes.ts`: `/api/notes`.
16. `server/routes/progressRoutes.ts`: `/api/progress`.
17. `server/routes/adminRoutes.ts`: `/api/admin` (protected by `requireRole('ADMIN', 'SUPER_ADMIN')`).
18. `server/services/authService.ts`: Password hashing (`bcrypt.hash`/`compare`), JWT signing (`signToken`), and token verification.
19. `server/app.ts`: Express application configuration (Helmet, CORS, CookieParser, BodyParser, Router mounting).
20. `server/index.ts`: Entrypoint starting server & listening on port.

### Tests (`server/tests/` & `vitest.config.ts`)
21. `vitest.config.ts`: Vitest configuration file.
22. `server/tests/authService.test.ts`: Password hashing & JWT token verification tests.
23. `server/tests/authRoutes.test.ts`: Registration, login, duplicate account, invalid credentials, logout, and `/me` tests.
24. `server/tests/authMiddleware.test.ts`: `requireAuth` and `requireRole` authorization tests.
25. `server/tests/validation.test.ts`: Zod validation failure tests.

### Frontend Adaptations
26. `src/api/httpAdapter.ts`: `HttpApiClient` implementing `ApiClient` via `fetch` calling `/api/*` endpoints.

---

## 4. Files to Modify
1. `package.json`: Add backend dependencies (`express`, `mongoose`, `zod`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `cors`, `helmet`, `dotenv`, `vitest`, `supertest`, `@types/*`).
2. `.gitignore`: Ensure `.env` and local logs are excluded.
3. `src/api/index.ts`: Export `httpApiClient` as primary client adapter with `MockApiClient` fallback.

---

## 5. Files to Remove
* None. (Legacy files were already removed in Phase 0).

---

## 6. Database Schema Design

### `User` Collection
```ts
{
  _id: ObjectId,
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], default: 'USER' },
  streakDays: { type: Number, default: 1 },
  solvedCount: { type: Number, default: 0 },
  algorithmsLearned: { type: Number, default: 1 },
  createdAt: Date,
  updatedAt: Date
}
```

### `Problem` Collection
```ts
{
  _id: ObjectId,
  problemId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  category: { type: String, required: true },
  tags: [String],
  description: { type: String, required: true },
  starterCode: { cpp: String, c: String, java: String, python: String },
  testCases: [{ input: String, expected: String }],
  createdAt: Date
}
```

### `Submission` Collection
```ts
{
  _id: ObjectId,
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  problemId: { type: String, required: true, index: true },
  language: { type: String, required: true },
  code: { type: String, required: true },
  passed: { type: Boolean, required: true },
  runtimeMs: Number,
  memoryMb: Number,
  createdAt: Date
}
```

### `Note` Collection
```ts
{
  _id: ObjectId,
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  algorithmId: String,
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### `ProgressTrack` Collection
```ts
{
  _id: ObjectId,
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  weeklyActivity: [{ day: String, minutes: Number, steps: Number }],
  difficultyDistribution: [{ name: String, value: Number, color: String }],
  updatedAt: Date
}
```

---

## 7. Authentication Flow
1. **Register** (`POST /api/auth/register`):
   - Zod validates `name`, `email` format, `password` length (min 8 chars).
   - Normalize email to lowercase. Check duplicate email in `User` collection.
   - Hash password using `bcryptjs` with salt round 10.
   - Insert user into MongoDB.
   - Generate JWT token containing `{ userId, role }`.
   - Set HTTP-only secure cookie `algoflow_token`.
   - Return `{ user }` (excluding `passwordHash`).

2. **Login** (`POST /api/auth/login`):
   - Zod validates input credentials.
   - Fetch user by normalized email including `passwordHash`.
   - If user not found or `bcrypt.compare()` fails, return generic `401 Invalid email or password` (prevents user enumeration).
   - Issue JWT token in HTTP-only secure cookie.
   - Return `{ user }`.

3. **Logout** (`POST /api/auth/logout`):
   - Clear `algoflow_token` cookie with `maxAge: 0`.
   - Return `{ message: "Logged out successfully" }`.

4. **Current User Session** (`GET /api/auth/me`):
   - Extract JWT token from cookie or `Authorization: Bearer <token>`.
   - Verify token signature.
   - Query user from MongoDB by `userId`.
   - Return `{ user }`.

---

## 8. Authorization Flow
* **Middleware**: `requireAuth` parses JWT and attaches `req.user = { userId, role }`.
* **RBAC Middleware**: `requireRole(...roles)` verifies `roles.includes(req.user.role)`.
* If role check fails, returns `403 Forbidden: Insufficient permissions`.

---

## 9. Security Architecture
* **CORS**: Restricted to `CLIENT_URL` (e.g. `http://localhost:5173` or production domain) with `credentials: true`.
* **Helmet**: Enforces HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`).
* **Cookies**: `HttpOnly`, `SameSite: 'lax'`, `Secure` in production.
* **Rate Limiting**:
  * Auth routes (`/api/auth/*`): 10 requests per 15 minutes per IP.
  * General API routes (`/api/*`): 100 requests per 15 minutes per IP.
* **No Secrets in Frontend / Git**: Secrets kept strictly in backend `.env`.

---

## 10. API Endpoints
* `POST /api/auth/register`
* `POST /api/auth/login`
* `POST /api/auth/logout`
* `GET  /api/auth/me`
* `GET  /api/problems`
* `GET  /api/problems/:id`
* `POST /api/problems/:id/submit`
* `GET  /api/notes`
* `POST /api/notes`
* `DELETE /api/notes/:id`
* `GET  /api/progress`
* `GET  /api/admin/metrics` (Protected: `requireRole('ADMIN', 'SUPER_ADMIN')`)

---

## 11. Migration Strategy from `localStorage`/`MockApiClient`
* The `ApiClient` interface in `src/api/client.ts` serves as the contract.
* `HttpApiClient` in `src/api/httpAdapter.ts` handles network requests to the Express server.
* `src/api/index.ts` exports `httpApiClient` as primary, while `MockApiClient` remains available as fallback if the backend is unreachable.

---

## 12. Testing Strategy
* Use **Vitest** + **Supertest** to test:
  1. Password hashing & verification (`authService.test.ts`).
  2. Registration validation & duplicate prevention (`authRoutes.test.ts`).
  3. Login validation & invalid password handling (`authRoutes.test.ts`).
  4. Auth middleware & invalid token rejection (`authMiddleware.test.ts`).
  5. Role authorization (`ADMIN` vs `USER` access to `/api/admin/metrics`).
  6. Zod input validation failure handling (`validation.test.ts`).

---

## 13. Risks & Mitigations
* **Database Connection Failure**: Express app handles MongoDB connection loss gracefully without crashing the process.
* **Cookie Cross-Origin Policies**: `cors` configured with `credentials: true` and `origin: CLIENT_URL`.

---

## 14. Rollback Strategy
If backend integration fails or MongoDB is unavailable, `src/api/index.ts` can immediately fall back to `MockApiClient` to preserve 100% frontend availability.
