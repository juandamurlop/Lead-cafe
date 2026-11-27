const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const API_BASE = (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

/** Static fictitious fixtures are used only when explicitly enabled (VITE_DEMO_DATA=true). */
export const demoData = env.VITE_DEMO_DATA === 'true';
