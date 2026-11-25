import React, {useState, useEffect} from "react";
import {NavLink, Outlet, useLocation, useNavigate} from "react-router-dom";
import {useLanguage} from "../i18n";
import {useTheme} from "../theme";
import {getCurrentUser, logout} from "../utils/auth";
import {DEMO_MODE} from "../config";
import "./Layout.css";

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  products: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>,
  licenses: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  apikeys: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L21 2M15 6l3 3M18 3l3 3"/></svg>,
  users: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 4.5a3.5 3.5 0 010 7M17.5 15.5c2 .6 3.5 2 4 4.5"/></svg>,
  languages: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>,
  docs: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>,
  settings: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.01a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h.01a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.01a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z"/></svg>,
  about: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>,
};

function Layout() {
  const {t, lang, setLang, available, fetchLanguages} = useLanguage();
  const {mode, setMode} = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const role = user && user.role ? user.role : "viewer";

  useEffect(() => {
    fetchLanguages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titles = {
    "/dashboard": t("nav.dashboard"),
    "/products": t("nav.products"),
    "/licenses": t("nav.licenses"),
    "/api-keys": t("nav.apiKeys"),
    "/users": t("nav.users"),
    "/languages": t("nav.languages"),
    "/docs": t("nav.apiDocs"),
    "/settings": t("nav.settings"),
    "/about": t("nav.about"),
  };
  const title = titles[location.pathname] || t("common.appName");

  // Users is admin-only (GET /api/users is admin-only on the backend);
  // Languages is admin/manager.
  const canManageUsers = role === "admin";
  const canManage = role === "admin" || role === "manager";
  const navItems = [
    {to: "/dashboard", label: t("nav.dashboard"), icon: ICONS.dashboard, show: true},
    {to: "/products", label: t("nav.products"), icon: ICONS.products, show: true},
    {to: "/licenses", label: t("nav.licenses"), icon: ICONS.licenses, show: true},
    {to: "/api-keys", label: t("nav.apiKeys"), icon: ICONS.apikeys, show: true},
    {to: "/users", label: t("nav.users"), icon: ICONS.users, show: canManageUsers},
    {to: "/languages", label: t("nav.languages"), icon: ICONS.languages, show: canManage},
    {to: "/docs", label: t("nav.apiDocs"), icon: ICONS.docs, show: true},
    {to: "/settings", label: t("nav.settings"), icon: ICONS.settings, show: true},
    {to: "/about", label: t("nav.about"), icon: ICONS.about, show: true},
  ];

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="layout">
      <aside className={`layout-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="layout-brand">{t("common.appName")}</div>
        <nav>
          {navItems.filter((i) => i.show).map((item) => (
            <NavLink key={item.to} to={item.to} className={({isActive}) => `layout-nav-link${isActive ? " active" : ""}`} onClick={() => setSidebarOpen(false)}>
              <span className="layout-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {sidebarOpen && <div className="layout-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div className="layout-main">
        <header className="layout-topbar">
          <button className="layout-hamburger" aria-label={t("nav.menu")} onClick={() => setSidebarOpen((v) => !v)}>
            <span /><span /><span />
          </button>
          <h1 className="layout-title">{title}</h1>
          <div className="layout-topbar-right">
            {DEMO_MODE && <span className="layout-demo-badge">Demo</span>}
            <select className="layout-select" aria-label={t("common.theme")} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
              <option value="auto">{t("theme.auto")}</option>
            </select>
            <select className="layout-select" aria-label={t("common.language")} value={lang} onChange={(e) => setLang(e.target.value)}>
              {available.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            {user && user.email && <span className="layout-user">{user.email} ({t(`roles.${role}`) === `roles.${role}` ? role : t(`roles.${role}`)})</span>}
            <button className="layout-logout" onClick={handleLogout}>{t("nav.logout")}</button>
          </div>
        </header>
        <main className="layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
