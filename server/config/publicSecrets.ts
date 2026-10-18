// Secrets that are public (they are, or were, in this repository). They are never accepted outside test mode.
// The two KNOWN_DEV_FALLBACK_* values were the built-in defaults before Sprint 8; the others were the .env.example
// placeholders until the hardening pass. No imports, so tools (generateLocalSecrets) can load it without env.ts.
export const KNOWN_DEV_FALLBACK_JWT = 'super_secret_algoflow_jwt_key_32bytes_min_prod';
export const KNOWN_DEV_FALLBACK_COOKIE = 'super_secret_cookie_signing_key_32bytes';
export const ENV_EXAMPLE_PLACEHOLDER_JWT = 'replace_with_a_secure_random_jwt_secret_min_32_characters';
export const ENV_EXAMPLE_PLACEHOLDER_COOKIE = 'replace_with_a_secure_random_cookie_secret_min_32_characters';
export const PUBLIC_SECRETS: ReadonlySet<string> = new Set([
  KNOWN_DEV_FALLBACK_JWT,
  KNOWN_DEV_FALLBACK_COOKIE,
  ENV_EXAMPLE_PLACEHOLDER_JWT,
  ENV_EXAMPLE_PLACEHOLDER_COOKIE,
]);
