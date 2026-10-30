import type { ApiClient } from './client';
import { httpApiClient } from './httpAdapter';
import { mockApiClient } from './mockAdapter';
import { resolveApiRuntime } from '../config/deployment';

export * from './client';
export { HttpApiClient, httpApiClient, setUnauthorizedHandler } from './httpAdapter';
export { MockApiClient, mockApiClient } from './mockAdapter';

// Production and standard application runtime default to real httpApiClient.
// MockApiClient is only active if explicitly enabled via VITE_USE_MOCK_API === 'true', and a deployable (non-e2e)
// production bundle refuses to start with it (resolveApiRuntime throws; the build itself already fails).
const { useMock } = resolveApiRuntime(import.meta.env);

export const apiClient: ApiClient = useMock ? mockApiClient : httpApiClient;

/** the mock API is in use: data is kept in this browser, not on a server (pages say so instead of passing it off as an account's) */
export const isMockApi = useMock;
