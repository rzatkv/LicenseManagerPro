import React, {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {useLanguage} from "../i18n";
import {getCurrentUser, logout} from "../utils/auth";
import "./ProfileMenu.css";

/** Header profile menu (v2.3): avatar (photo or initials) with a modern
 * dropdown — Profile, Settings, Logout. */
function ProfileMenu() {
  const {t} = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const user = getCurrentUser();

  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!user) return null;
  const name = user.display_name || user.email || "?";
  const initials = name
    .split(/[@\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  const roleLabel = t(`roles.${user.role}`);
  const go = (to) => { setOpen(false); navigate(to); };
  const handleLogout = () => { setOpen(false); logout(); navigate("/"); };

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="profile-menu-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        title={name}
      >
        {user.avatar_url ? (
          <img className="profile-menu-avatar" src={user.avatar_url} alt="" />
        ) : (
          <span className="profile-menu-avatar profile-menu-initials" aria-hidden="true">{initials}</span>
        )}
      </button>
      {open && (
        <div className="profile-menu-dropdown" role="menu">
          <div className="profile-menu-head">
            {user.avatar_url ? (
              <img className="profile-menu-avatar" src={user.avatar_url} alt="" />
            ) : (
              <span className="profile-menu-avatar profile-menu-initials" aria-hidden="true">{initials}</span>
            )}
            <div className="profile-menu-head-text">
              <span className="profile-menu-name">{name}</span>
              <span className="profile-menu-email">{user.email}</span>
              <span className="profile-menu-role">{roleLabel === `roles.${user.role}` ? user.role : roleLabel}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={() => go("/profile")}>
            <span aria-hidden="true">👤</span> {t("profileMenu.profile")}
          </button>
          <button type="button" role="menuitem" onClick={() => go("/settings")}>
            <span aria-hidden="true">⚙️</span> {t("profileMenu.settings")}
          </button>
          <button type="button" role="menuitem" className="profile-menu-logout" onClick={handleLogout}>
            <span aria-hidden="true">🚪</span> {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
