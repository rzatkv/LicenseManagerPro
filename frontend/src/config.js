// Base URL of the backend API.
// Override with REACT_APP_API_URL (e.g. in a .env file in frontend/).
export const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api";

// Demo mode: when the app is built with REACT_APP_DEMO_MODE=true, the
// frontend answers every API call from the in-browser mock in
// utils/demoData.js instead of calling a backend (used by the
// GitHub Pages demo). Normal builds are unaffected.
export const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === "true";
