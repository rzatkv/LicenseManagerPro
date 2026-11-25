import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // فایل استایل عمومی

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
);

// Register the service worker in production builds only, so the app is
// installable as a PWA. The relative path keeps it working under the
// GitHub Pages subpath as well as at a domain root.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("./service-worker.js")
            .catch((error) => console.error("Service worker registration failed:", error));
    });
}
