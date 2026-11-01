/**
 * The browser side of the session (see docs/authentication.md).
 *
 * - The access token lives only in this module's memory: never in localStorage, sessionStorage or a cookie, so a
 *   reload or a new tab starts without one and gets one from POST /auth/refresh (the HttpOnly refresh cookie).
 * - One refresh at a time: every caller that needs a new access token while a refresh is running waits for that same
 *   refresh (single flight). Requests are retried at most once after it.
 * - The access token is renewed shortly before it expires, so ordinary requests rarely meet an expired one.
 * - Logout bumps the session epoch: a refresh that was already running when the user signed out cannot sign them
 *   back in when it finishes.
 */

export type RefreshOutcome =
  /** a new access token is in memory */
  | 'refreshed'
  /** the server says there is no session any more (401): signed out */
  | 'ended'
  /** the refresh could not be done right now (network, server error, rate limit, origin refusal): the session may
   *  still be valid, so nothing is cleared */
  | 'unavailable';

interface FetchLikeResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}
type FetchLike = (url: string, init: RequestInit) => Promise<FetchLikeResponse>;

/** renew this long before the access token expires (or a fifth of its lifetime, when that is shorter) */
const RENEW_BEFORE_EXPIRY_MS = 60_000;
/** never schedule renewals closer together than this */
const MIN_RENEW_DELAY_MS = 5_000;
/** a 409 means another tab rotated the refresh cookie a moment ago: wait for its new cookie, then try again */
const CONFLICT_RETRY_DELAYS_MS = [250, 750];
const UNAVAILABLE_RETRY_MS = 30_000;
const REFRESH_TIMEOUT_MS = 10_000;

let accessToken: string | null = null;
let accessExpiresAt = 0;
let accessLifetimeMs = 0;
/** this tab has (or had, until the server says otherwise) a session: only then is a refresh worth trying */
let sessionKnown = false;
let epoch = 0;
let inFlight: Promise<RefreshOutcome> | null = null;
let renewTimer: ReturnType<typeof setTimeout> | null = null;
let onSessionEnded: (() => void) | null = null;
let apiBase = '/api';
let fetchImpl: FetchLike = (url, init) => fetch(url, init);

export function configureAuthSession(options: { apiBase?: string; fetch?: FetchLike; onSessionEnded?: (() => void) | null }): void {
  if (options.apiBase !== undefined) apiBase = options.apiBase;
  if (options.fetch !== undefined) fetchImpl = options.fetch;
  if (options.onSessionEnded !== undefined) onSessionEnded = options.onSessionEnded;
}

export const getAccessToken = (): string | null => accessToken;
export const hasSession = (): boolean => sessionKnown;
/** a refresh is running: requests should wait for it instead of being sent with the token it is replacing */
export const pendingRefresh = (): Promise<RefreshOutcome> | null => inFlight;

/**
 * Tells the app the user is signed out, but only if this tab really has no session now: a refresh that was overtaken
 * by a new sign-in also reports 'ended', and must not sign out the user who just signed in.
 */
export function notifySessionEndedIfGone(): void {
  if (!sessionKnown) onSessionEnded?.();
}

function clearRenewTimer(): void {
  if (renewTimer !== null) clearTimeout(renewTimer);
  renewTimer = null;
}

function scheduleRenewal(delayMs: number): void {
  clearRenewTimer();
  const scheduledEpoch = epoch;
  renewTimer = setTimeout(() => {
    renewTimer = null;
    if (scheduledEpoch !== epoch || !sessionKnown) return;
    void refreshAccessToken().then(outcome => {
      if (outcome === 'ended') notifySessionEndedIfGone();
      // still signed in, but the server could not be reached: try again later, while the token may still be valid
      else if (outcome === 'unavailable' && scheduledEpoch === epoch && sessionKnown) scheduleRenewal(UNAVAILABLE_RETRY_MS);
    });
  }, Math.max(MIN_RENEW_DELAY_MS, delayMs));
}

/** stores a new access token (from login, register or refresh) and schedules its renewal */
export function setAccessToken(token: string, expiresAtIso: string, now = Date.now()): void {
  const expiresAt = Date.parse(expiresAtIso);
  accessToken = token;
  sessionKnown = true;
  accessExpiresAt = Number.isFinite(expiresAt) ? expiresAt : now + 60_000;
  accessLifetimeMs = Math.max(0, accessExpiresAt - now);
  const lead = Math.min(RENEW_BEFORE_EXPIRY_MS, accessLifetimeMs / 5);
  scheduleRenewal(accessExpiresAt - now - lead);
}

/** sign-in: a new session replaces whatever this tab had (a refresh still running for the old one is ignored) */
export function startSession(token: string, expiresAtIso: string): void {
  epoch += 1;
  setAccessToken(token, expiresAtIso);
}

/** forgets the session in this tab: the access token, the renewal timer, and any refresh still running */
export function clearSession(): void {
  epoch += 1;
  accessToken = null;
  accessExpiresAt = 0;
  sessionKnown = false;
  clearRenewTimer();
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function postRefresh(): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    // the refresh token travels only as its HttpOnly cookie; nothing is put in the URL, the body or a header
    const response = await fetchImpl(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runRefresh(startEpoch: number): Promise<RefreshOutcome> {
  for (let attempt = 0; ; attempt++) {
    let result: { status: number; body: any };
    try {
      result = await postRefresh();
    } catch {
      return 'unavailable';
    }
    // signed out (or in again) while this was running: its result belongs to a session that no longer exists here
    if (startEpoch !== epoch) return 'ended';

    if (result.status === 200 && typeof result.body?.accessToken === 'string') {
      setAccessToken(result.body.accessToken, String(result.body.accessTokenExpiresAt ?? ''));
      return 'refreshed';
    }
    if (result.status === 409 && attempt < CONFLICT_RETRY_DELAYS_MS.length) {
      await sleep(CONFLICT_RETRY_DELAYS_MS[attempt]);
      if (startEpoch !== epoch) return 'ended';
      continue;
    }
    if (result.status === 401) {
      clearSession();
      return 'ended';
    }
    return 'unavailable';
  }
}

/**
 * Gets a new access token with the refresh cookie. Concurrent callers share one request. Resolves, never rejects.
 */
export function refreshAccessToken(): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  const startEpoch = epoch;
  const run = runRefresh(startEpoch).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** page load: is there a session to resume? (a refresh cookie the server accepts) */
export async function resumeSession(): Promise<boolean> {
  sessionKnown = true;
  const outcome = await refreshAccessToken();
  if (outcome !== 'refreshed') {
    if (outcome === 'unavailable') sessionKnown = false;
    return false;
  }
  return true;
}

/**
 * For logout: forgets the session here at once, and returns the access token it had (sent with the logout request so
 * the server can end this session even when the cookie is gone). A refresh still running is waited for first, so its
 * new cookie has arrived before the logout request is sent; whatever it returns is discarded.
 */
export async function endSessionForLogout(): Promise<string | null> {
  const token = accessToken;
  const running = inFlight;
  clearSession();
  if (running) await running;
  return token;
}

/** test helper: back to a fresh page */
export function _resetAuthSessionForTesting(): void {
  clearSession();
  inFlight = null;
  epoch = 0;
  onSessionEnded = null;
  apiBase = '/api';
  fetchImpl = (url, init) => fetch(url, init);
}
