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

// v2.3: NEVER register the service worker. The old CRA worker kept the
// previous bundle controlling the page across revisits, so shipped fixes
// did not appear in the live render (this is what made the v2.2.1/v2.2.2
// checkbox and table fixes "not work" in the phone check while the
// bundle itself already contained them). Unregister any worker a
// previous visit installed, on every load, so the demo always serves
// fresh assets. Offline/PWA installability is intentionally dropped
// for the demo in favour of freshness.
if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
}
