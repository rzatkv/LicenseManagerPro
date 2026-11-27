import React, {useState, useEffect, useRef, useLayoutEffect} from "react";
import {NavLink, Outlet, useLocation} from "react-router-dom";
import {useLanguage} from "../i18n";
import {getCurrentUser} from "../utils/auth";
import {get} from "../utils/api";
import NotificationsBell from "./NotificationsBell";
import GlobalSearch from "./GlobalSearch";
import ThemeToggle from "./ThemeToggle";
import {useDismissOnOutsideOrEscape} from "../utils/useDismiss";
import LanguageMenu from "./LanguageMenu";
import ProfileMenu from "./ProfileMenu";
import {DEMO_MODE} from "../config";
import {
  LayoutDashboard, Package, Lock, KeyRound, Users, ShieldCheck, Globe,
  BookOpen, Settings as SettingsIcon, Info, ScrollText, Download, Ban,
  Bell, Folder, ChevronDown,
} from "lucide-react";
import "./Layout.css";

/* Single icon source (v3.0.4): lucide-react, 18px outline icons. The
   hand-rolled inline SVGs these replace drew the same shapes. */
const ICONS = {
  dashboard: <LayoutDashboard size={18} />,
  products: <Package size={18} />,
  licenses: <Lock size={18} />,
  apikeys: <KeyRound size={18} />,
  users: <Users size={18} />,
  roles: <ShieldCheck size={18} />,
  languages: <Globe size={18} />,
  docs: <BookOpen size={18} />,
  settings: <SettingsIcon size={18} />,
  about: <Info size={18} />,
  audit: <ScrollText size={18} />,
  downloads: <Download size={18} />,
  blacklist: <Ban size={18} />,
  notifications: <Bell size={18} />,
  groups: <Folder size={18} />,
};

/** Mobile bottom nav (v2.3, ≤1024px only): the five most-used sections. */
const BOTTOM_NAV = [
  {to: "/dashboard", labelKey: "nav.dashboard", icon: ICONS.dashboard},
  {to: "/products", labelKey: "nav.products", icon: ICONS.products},
  {to: "/licenses", labelKey: "nav.licenses", icon: ICONS.licenses},
  {to: "/notifications", labelKey: "nav.notifications", icon: ICONS.notifications},
  {to: "/settings", labelKey: "nav.settings", icon: ICONS.settings},
];

function Layout() {
  const {t, lang, fetchLanguages} = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [siteName, setSiteName] = useState("License Manager Pro");
  const [logoUrl, setLogoUrl] = useState("./logo.svg");
  const location = useLocation();
  const user = getCurrentUser();
  const role = user && user.role ? user.role : "viewer";

  // Branding (site_name / logo_url) comes from the settings API; the
  // defaults above render while it loads or when the fetch fails.
  // The date-calendar choice (v3.0) is synced here too, so dates render
  // in the admin's chosen calendar on every device.
  useEffect(() => {
    let cancelled = false;
    get("/settings")
      .then((data) => {
        if (cancelled || !data) return;
        if (data.site_name) setSiteName(data.site_name);
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.date_calendar) {
          try { localStorage.setItem("lmp-calendar", data.date_calendar); } catch (e) {}
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Escape closes the mobile drawer (listener only while it is open).
  // v3.0.6: shared dismiss hook (Escape-only here — outside taps are
  // handled by the content-area click below).
  useDismissOnOutsideOrEscape([], () => setSidebarOpen(false), {enabled: sidebarOpen, outsideClick: false});

  // Custom languages (if any) are merged into the i18n dictionaries here
  // so nav labels and page strings use them; the language picker itself
  // lives in Settings.
  useEffect(() => {
    fetchLanguages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Users, Roles and Blacklist are admin-only (their APIs are admin-only);
  // Activity History is admin/manager (audit-logs API: 403 else).
  const canManageUsers = role === "admin";
  const canManage = role === "admin" || role === "manager";

  /* Hierarchical menu (v3.0.4, extended v3.0.5, regrouped v3.0.6): EVERY
     sidebar item lives in an accordion group — except Settings, which
     is a top-level link (it is the one configuration area, a different
     kind of thing from every group, so a group of one would be
     dishonest). A group parent only toggles its sub-menu (it does not
     navigate). Grouping rationale (v3.0.6 — ask "what IS this?" per
     item): Overview = the read-only monitoring/info pages (Dashboard,
     Notifications, Activity History, About); Licenses = the license
     domain; Access = access control; Resources = the take-away
     integration resources (module ZIPs + API docs) — Downloads is
     distribution, not management, and API Docs is documentation, not a
     setting. Notifications is an alert inbox, not management; Activity
     History is a record of what happened, not a setting. */
  const [openGroups, setOpenGroups] = useState({});
  const GROUPS = [
    {id: "overview", label: t("nav.groupOverview"), icon: ICONS.dashboard, routes: ["/dashboard", "/notifications", "/audit-logs", "/about"], items: [
      {to: "/dashboard", label: t("nav.dashboard"), icon: ICONS.dashboard, show: true},
      {to: "/notifications", label: t("nav.notifications"), icon: ICONS.notifications, show: true},
      {to: "/audit-logs", label: t("nav.auditLogs"), icon: ICONS.audit, show: canManage},
      {to: "/about", label: t("nav.about"), icon: ICONS.about, show: true},
    ]},
    {id: "licenses", label: t("nav.groupLicenses"), icon: ICONS.licenses, routes: ["/licenses", "/products", "/product-groups"], items: [
      {to: "/licenses", label: t("nav.licenses"), icon: ICONS.licenses, show: true},
      {to: "/products", label: t("nav.products"), icon: ICONS.products, show: true},
      {to: "/product-groups", label: t("nav.productGroups"), icon: ICONS.groups, show: true},
    ]},
    {id: "access", label: t("nav.groupAccess"), icon: ICONS.apikeys, routes: ["/api-keys", "/users", "/roles", "/blacklist"], items: [
      {to: "/api-keys", label: t("nav.apiKeys"), icon: ICONS.apikeys, show: true},
      {to: "/users", label: t("nav.users"), icon: ICONS.users, show: canManageUsers},
      {to: "/roles", label: t("nav.roles"), icon: ICONS.roles, show: canManageUsers},
      {to: "/blacklist", label: t("nav.blacklist"), icon: ICONS.blacklist, show: canManageUsers},
    ]},
    {id: "resources", label: t("nav.groupResources"), icon: ICONS.downloads, routes: ["/downloads", "/docs"], items: [
      {to: "/downloads", label: t("nav.downloads"), icon: ICONS.downloads, show: true},
      {to: "/docs", label: t("nav.apiDocs"), icon: ICONS.docs, show: true},
    ]},
  ];
  const groupActive = (group) => group.routes.includes(location.pathname);
  const isGroupOpen = (id, active) => (openGroups[id] !== undefined ? openGroups[id] : active);
  // The active page's group stays open when navigating to it (e.g. via
  // a deep link, the bottom nav or global search).
  useEffect(() => {
    const active = GROUPS.find((g) => groupActive(g));
    if (active) setOpenGroups((g) => (g[active.id] ? g : {...g, [active.id]: true}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  const toggleGroup = (id, active) =>
    setOpenGroups((g) => ({...g, [id]: !(g[id] !== undefined ? g[id] : active)}));
  const renderGroup = (id, label, icon, items, active) => {
    const visible = items.filter((i) => i.show);
    if (visible.length === 0) return null;
    const open = isGroupOpen(id, active);
    return (
      <div key={id} className="layout-nav-group">
        <button
          type="button"
          className={`layout-nav-group-btn${open ? " open" : ""}${active ? " active-group" : ""}`}
          aria-expanded={open}
          onClick={() => toggleGroup(id, active)}
        >
          <span className="layout-nav-icon">{icon}</span>
          <span>{label}</span>
          <ChevronDown size={16} className="layout-nav-chevron" />
        </button>
        {open && (
          <div className="layout-nav-submenu">
            {visible.map((item) => (
              <NavLink key={item.to} to={item.to} className={({isActive}) => `layout-nav-link layout-nav-sublink${isActive ? " active" : ""}`} onClick={() => setSidebarOpen(false)}>
                <span className="layout-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Telegram-style bottom nav (v3.0.5): a sliding pill highlights the
  // active item. Measured with getBoundingClientRect (direction-safe in
  // RTL — offsetLeft is not), re-measured on navigation, language
  // change and resize; the pill animates with a CSS transition.
  const bottomNavRef = useRef(null);
  const [navPill, setNavPill] = useState({left: 0, width: 0, visible: false});
  useLayoutEffect(() => {
    const measure = () => {
      const nav = bottomNavRef.current;
      if (!nav) return;
      const active = nav.querySelector(".layout-bottomnav-link.active");
      if (!active) { setNavPill((v) => (v.visible ? {...v, visible: false} : v)); return; }
      const navRect = nav.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setNavPill({left: rect.left - navRect.left + 6, width: Math.max(0, rect.width - 12), visible: true});
    };
    measure();
    const timer = setTimeout(measure, 300); // after fonts settle
    window.addEventListener("resize", measure);
    return () => { clearTimeout(timer); window.removeEventListener("resize", measure); };
  }, [location.pathname, lang]);

  return (
    <div className="layout">
      <aside className={`layout-sidebar ${sidebarOpen ? "open" : ""}`}>
        <button className="layout-sidebar-close" aria-label={t("common.close")} onClick={() => setSidebarOpen(false)}>
          ×
        </button>
        <div className="layout-brand">
          <img src={logoUrl} alt="" />
          <span>{siteName}</span>
        </div>
        <nav>
          {GROUPS.map((group) => renderGroup(group.id, group.label, group.icon, group.items, groupActive(group)))}
          {/* Settings is a top-level link, not a group (v3.0.6): it is
              the one configuration area, a different kind of thing from
              every group. */}
          <NavLink to="/settings" className={({isActive}) => `layout-nav-link${isActive ? " active" : ""}`} onClick={() => setSidebarOpen(false)}>
            <span className="layout-nav-icon">{ICONS.settings}</span>
            <span>{t("nav.settings")}</span>
          </NavLink>
        </nav>
      </aside>
      <div
        className="layout-main"
        onClick={(e) => {
          // Belt-and-braces for the drawer: any tap on the content area
          // (not on the hamburger that just opened it) closes the drawer,
          // even if some element above the backdrop swallowed the tap.
          if (sidebarOpen && !e.target.closest(".layout-hamburger")) setSidebarOpen(false);
        }}
      >
        <header className="layout-topbar">
          <button className="layout-hamburger" aria-label={t("nav.menu")} onClick={() => setSidebarOpen((v) => !v)}>
            <span /><span /><span />
          </button>
          <div className="layout-search">
            <GlobalSearch />
          </div>
          <div className="layout-topbar-right">
            {DEMO_MODE && <span className="layout-demo-badge">{t("common.demo")}</span>}
            <NotificationsBell />
            <ThemeToggle />
            <LanguageMenu />
            <ProfileMenu />
          </div>
        </header>
        <main className="layout-content">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <nav className="layout-bottomnav" aria-label={t("nav.menu")} ref={bottomNavRef}>
        {navPill.visible && (
          <span className="layout-bottomnav-indicator" aria-hidden="true" style={{transform: `translateX(${navPill.left}px)`, width: navPill.width}} />
        )}
        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({isActive}) => `layout-bottomnav-link${isActive ? " active" : ""}`}>
            <span className="layout-bottomnav-icon">{item.icon}</span>
            <span className="layout-bottomnav-label">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      {/* Rendered last in the DOM (after .layout-main) and only while open:
          nothing in the normal flow paints above it, and removing it on
          close leaves no invisible layer that could block taps afterwards.
          z-index 200 sits above the topbar (50) and the page, below the
          sidebar (210) and any modal (900). */}
      {sidebarOpen && (
        <div
          className="layout-backdrop"
          role="button"
          aria-label={t("common.close")}
          tabIndex={0}
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setSidebarOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default Layout;
