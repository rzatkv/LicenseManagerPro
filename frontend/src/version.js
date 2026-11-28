// Single source of truth for the frontend app version (v3.0.11).
// The dashboard highlights slide renders "New in v{version}" from this
// constant — never a hard-coded old version in a translation string.
// demoData.js imports this too, so the demo and the real app can never
// disagree about the version. Bump together with backend/config.py.
export const APP_VERSION = "3.0.11";
