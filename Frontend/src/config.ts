// API base URL.
// In development, the Vite dev server proxies /api/* to the backend (see vite.config.ts),
// so we can use a relative URL and avoid CORS entirely. To bypass the proxy
// (e.g. for direct curl testing), set VITE_API_BASE_URL=http://localhost:5000 in .env.
export const API_BASE_URL: string =
    (import.meta.env.VITE_API_BASE_URL as string) || "";

export const API_V1 = `${API_BASE_URL}/api/v1`;
export const API_V2 = `${API_BASE_URL}/api/v2`;
