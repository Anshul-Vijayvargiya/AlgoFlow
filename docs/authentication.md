# Authentication and sessions

AlgoFlow signs users in with an email address and a password (bcrypt, cost 10). A signed-in browser holds two
credentials:

| | Access token | Refresh token |
|---|---|---|
| What it is | A JWT (HS256, signed with `JWT_SECRET`) | 32 random bytes (256 bits), base64url |
| Lifetime | `ACCESS_TOKEN_TTL`, default 15 minutes | `REFRESH_TOKEN_TTL`, default 7 days, renewed on each use |
| Where the browser keeps it | JavaScript memory only (`src/api/authSession.ts`) | An `HttpOnly` cookie, `algoflow_refresh` |
| How it is sent | `Authorization: Bearer …` on API requests | Automatically, only to `/api/auth/*` |
| Where the server keeps it | Nowhere: it is verified by signature | Only its SHA-256 hash, in the `authsessions` collection |
| Claims / data | `sub` (user id), `sid` (session id), `tv` (token version), `typ: "access"`, `iat`, `exp` | One `AuthSession` document per signed-in device |

Role and account status are never put in a token. They are read from the database on every request.

## Flows

**Register / log in** (`POST /api/auth/register`, `POST /api/auth/login`, rate-limited). The server checks the
password. A suspended account is refused with 403, but only after the password has been verified, so an outsider
cannot find out that an account is suspended. On success it creates an `AuthSession`, sets the refresh cookie and
answers `{ user, accessToken, accessTokenExpiresAt }`. The front end keeps the access token in memory.

**Every authenticated request** (`requireAuth`):
1. It takes the access token from the `Authorization` header only, never from a cookie, the URL or the body.
2. It verifies the signature (HS256 only), the expiry and the claims: `typ` must be `access`, `sub` and `sid` must
   be well-formed ids, and `tv` must be a whole number of 0 or more.
3. It loads the user and the session. The user must exist and be `active`, and must still have the `tokenVersion`
   that is in the token. The session must exist, belong to that user, and be neither revoked nor expired.
4. It takes `req.user.role` from the database.

401 answers carry a `code`:

| Code | Meaning | What the front end does |
|---|---|---|
| `ACCESS_TOKEN_EXPIRED` | The JWT expired | Refreshes, then retries once |
| `AUTH_REQUIRED` | No token was sent | Refreshes and retries once, but only if this tab had a session |
| `SESSION_INVALID` | The token is unreadable, or the user is unknown | Refreshes, then retries once |
| `SESSION_REVOKED` | Logged out, logged out everywhere, demoted, or reactivated after a suspension | Signs out |
| `ACCOUNT_SUSPENDED` | The account is suspended | Signs out |

A 401 from an ordinary request never clears the refresh cookie. Only the refresh endpoint decides whether the
session is over.

**Refresh** (`POST /api/auth/refresh`). The refresh token is read from its cookie only. It is never taken from the
URL, the body, a header or browser storage. The server then makes these checks, in this order:
1. It requires the front end's exact `Origin` (see *CSRF* below).
2. It checks the token's shape and finds the session by its hash.
3. The session must not be revoked.
4. The token must be the session's current one. Otherwise it is **reuse**, and the whole session is revoked
   (`reuse_detected`) and 401 is returned. The one exception is the token that was replaced less than 10 seconds
   ago: two tabs or a retried request refreshing at the same moment get **409 `REFRESH_IN_PROGRESS`**. The cookie is
   not changed, and the client retries with the cookie the winning response set.
5. The session must not have expired.
6. The user must exist, be active, and still be on the session's `tokenVersion`. Otherwise the session is revoked.
7. **Rotation:** one atomic `findOneAndUpdate` that matches the current hash. Of several concurrent refreshes with
   one token, exactly one wins; the others see the race and get 409. The new hash replaces the old one, which goes
   onto a list of the last 10 hashes used for reuse detection. `expiresAt` moves to `now + REFRESH_TOKEN_TTL`.
8. It answers with a new cookie and `{ accessToken, accessTokenExpiresAt }`.

Failures answer 401 and clear the cookie: `REFRESH_INVALID`, `REFRESH_EXPIRED`, `SESSION_REVOKED` or
`ACCOUNT_SUSPENDED`.

**Logout** (`POST /api/auth/logout`) ends *this device's* session. It always clears the cookies and answers 200,
even with no cookie or a stale one. It revokes the session if the cookie is that session's current token, or the
token rotated away within the last 10 seconds, so a logout that races a refresh still works. Failing that, it uses
the session named in a valid access token. An older or unknown token revokes nothing: a stale cookie can never end a
newer session.

**Logout everywhere** (`POST /api/auth/logout-all`, requires a valid access token). It increments the user's
`tokenVersion`, which invalidates every access token and every session of the account, and marks all the sessions
revoked. The API method exists (`apiClient.auth.logoutAll()`); there is no button for it in the UI yet.

**Admin actions.** Suspending, reactivating or changing the role of a user increments their `tokenVersion` (the
existing code in `adminRoutes.ts`), so their access tokens stop working on the next request and their sessions are
revoked on the next refresh. Editing `role` or `accountStatus` directly in the database also takes effect on the next
request, because both are read on every request.

**`/api/auth/me`** returns the current user from the database.

### Front end (`src/api/authSession.ts`, `src/api/httpAdapter.ts`)

- **Page load:** `getCurrentUser()` has no access token yet, so it calls `/auth/refresh` (the cookie) and then
  `/auth/me`. If the refresh is refused the visitor is signed out. If the server cannot be reached, the visitor is
  shown signed out, but nothing is cleared.
- **One refresh at a time:** concurrent 401s share one refresh request. Requests that start while a refresh is
  running wait for it, then go out with the new token.
- **At most one retry:** a request that fails with 401 again after a refresh returns the error. It never refreshes
  a second time, so there is no loop.
- **A 401 does not always mean "signed out":** only a refused refresh (401) or `SESSION_REVOKED` /
  `ACCOUNT_SUSPENDED` signs the user out. A refresh that fails because of the network, a 5xx or a 429 leaves the
  session as it is.
- **Proactive renewal:** the token is renewed 60 seconds before it expires (or a fifth of its lifetime before, when
  that is shorter). After a network failure it tries again in 30 seconds.
- **Logout racing a refresh:** logout increments a session epoch and waits for any running refresh, so the logout
  request carries the newest cookie. The result of that refresh is discarded, so it cannot sign the user back in.
- `ProtectedRoute` and the admin role checks are unchanged. They still use the user from `useAuthStore`.

### Storage and cleanup

`AuthSession` documents hold:
- `userId`, `tokenHash` (unique), `previousTokenHashes`, `rotatedFromHash` and `rotatedAt`;
- `tokenVersion`, `createdAt`, `lastUsedAt` and `expiresAt`;
- `revokedAt` and `revokedReason`: `logout`, `logout_all`, `reuse_detected`, `account_inactive` or `token_version`.

A TTL index deletes a document 7 days after its `expiresAt`. The index is housekeeping only: every check compares
`expiresAt` and `revokedAt` itself, so a document MongoDB has not deleted yet is still refused. Mongoose creates the
indexes when the model is first used (`autoIndex`). If `autoIndex` is disabled in production, create them by hand:
`{ tokenHash: 1 }` unique, `{ userId: 1 }`, `{ previousTokenHashes: 1 }`, and `{ expiresAt: 1 }` with
`expireAfterSeconds: 604800`.

Tokens, cookies, passwords and request bodies are not logged. The error handler logs the method, the URL and the
error message. No auth URL contains a token.

## Cookies

```
algoflow_refresh=<token>; Path=/api/auth; Expires=<session expiry>; HttpOnly; SameSite=Lax; Secure (staging/production)
```

- **HttpOnly:** page scripts, including injected ones, cannot read the refresh token.
- **`Path=/api/auth`:** the cookie is sent only to the refresh and logout endpoints, never with ordinary API
  requests or to the front end's host paths.
- **No `Domain`:** host-only. It is never shared with sibling subdomains.
- **`SameSite=Lax`:** it is never sent on cross-site POSTs. `SameSite=None` is deliberately not used, and the code
  never switches to it.
- **`Secure`:** set in staging and production, so those must be served over https.

The access token is never a cookie, so ordinary API requests are not authenticated by any ambient browser
credential.

### CSRF

- The global `validateOrigin` check is unchanged. Every POST, PUT, PATCH and DELETE under `/api` with a foreign
  `Origin` or `Referer`, or with `Sec-Fetch-Site: cross-site`, gets 403. CORS still allows only `CLIENT_URL`, with
  credentials.
- `POST /api/auth/refresh` is stricter (`requireFrontendOrigin`). It needs `Origin` to equal `CLIENT_URL`'s origin
  exactly; a request without `Origin` is refused. When Fetch Metadata is sent, it must be `same-origin` or
  `same-site`. Browsers always send `Origin` on a `fetch` POST.
- The other endpoints are authenticated by the Bearer header, which a cross-site page cannot attach.

## Hosting

The refresh cookie must reach the API on `POST /api/auth/refresh`, and with `SameSite=Lax` a browser sends it only
when the front end and the API are **same-site**: the same scheme and the same registrable domain.

- **Recommended: one origin.** Serve the front end and the API behind one reverse proxy, with `/api/*` going to the
  API, and build with `VITE_API_BASE_URL=/api`. Everything is same-origin.
- **Also fine: sibling subdomains** of one domain you control, such as `app.example.com` and `api.example.com`, with
  `VITE_API_BASE_URL=https://api.example.com/api` and `CLIENT_URL=https://app.example.com`.
- **Does not work: unrelated hosting domains**, such as a front end on `*.vercel.app` with the API on
  `*.onrender.com`. Both are on the Public Suffix List, so every project there is its own site, and these two are
  cross-site to each other. The browser will not send a `SameSite=Lax` cookie on the front end's `fetch` to the
  API. Login appears to work, because the access token arrives in the response body. But every reload, new tab or
  renewal after `ACCESS_TOKEN_TTL` fails, and the user is signed out. Browsers that block third-party cookies refuse
  such cookies anyway.

  The access/refresh split **does not fix cross-site cookies**. The fix is hosting: add a custom domain to both
  services (for example `app.` and `api.` subdomains of your domain), or proxy `/api` through the front end's host
  (for example a Vercel rewrite of `/api/:path*` to the Render URL). Switching to `SameSite=None` is not an
  acceptable workaround: it would remove the cookie's CSRF protection and still fail where third-party cookies are
  blocked.

## Environment variables

| Variable | Default | Bounds | Notes |
|---|---|---|---|
| `ACCESS_TOKEN_TTL` | `15m` | 1m–24h; at most 1h in staging and production | Duration with a unit: `s`, `m`, `h`, `d`. A bare number is refused. |
| `REFRESH_TOKEN_TTL` | `7d` | 1h–90d; at most 30d in staging and production | Renewed on each refresh, so it is the session's idle timeout. Must be longer than `ACCESS_TOKEN_TTL`. |
| `JWT_SECRET` | — | At least 32 characters, not a published value (staging and production) | Signs access tokens. |
| `COOKIE_SECRET` | — | Same rules, and it must differ from `JWT_SECRET` | `cookie-parser`'s secret for signed cookies. The refresh cookie is not signed, because only its hash is stored and it is looked up by that hash. |

Startup fails on a malformed or out-of-range lifetime, and in staging and production on a missing, short, published
or reused secret.

**Why the two secrets must differ:** each key should do exactly one job. If `JWT_SECRET` were also the cookie
signing key, any signed cookie value would be produced with the access-token signing key. A leak of either value
through one subsystem (a misconfigured cookie library, a debug dump) would then also let an attacker mint access
tokens for any user and session id. Separate keys keep that damage contained, and each can be rotated without
touching the other.

**Rotating `JWT_SECRET`** makes every access token invalid at once. Users do not notice: the next request gets
`SESSION_INVALID`, the front end refreshes (the refresh token does not depend on `JWT_SECRET`), and the request is
retried.

## Migrating from the 7-day cookie

Before this change, the session was one JWT in an `algoflow_token` cookie (path `/`, 7 days).

- That cookie is no longer read. Its tokens have no `sid` or `typ`, so they would be refused even as Bearer tokens.
- Every login, register, refresh and logout response clears it.
- After the deploy, every existing user is signed out once and simply logs in again. No data migration is needed.
- The `authsessions` collection and its indexes are created on first use.
- Optional: rotate `JWT_SECRET` at the deploy, so that no old token is valid under any reading.
- Users' `tokenVersion` values are kept as they are.

## Limitations

- An access token stays valid until it expires. The per-request database check (the user's `tokenVersion` and the
  session's `revokedAt`) still revokes it at once in every case listed above. The token's short lifetime limits what
  a stolen copy can do if that check is ever bypassed.
- A script injected into the page (XSS) can use the in-memory access token while the page is open, and can call
  `/auth/refresh`. HttpOnly only stops it from reading the refresh token itself. XSS prevention (the CSP and React's
  escaping) is still essential.
- Reuse detection needs the stolen token to be used after the real one was rotated. A thief who refreshes first gets
  the session, until the real user's next refresh, which is then refused with `SESSION_REVOKED` and ends it.
- The 10-second grace window lets a token that was replaced within the last 10 seconds get a 409, never a new token.
  The session stays alive during that window.
- If a refresh response is lost in transit (the server rotated, but the browser never received the new cookie), the
  browser's next refresh, more than 10 seconds later, presents the replaced token. That counts as reuse: the session
  ends and the user signs in again. This is a deliberate trade-off in favour of theft detection.
- Sessions have an idle timeout (`REFRESH_TOKEN_TTL`) but no absolute maximum age.
- No MFA, by design for this change.
