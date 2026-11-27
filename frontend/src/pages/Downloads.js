import React, {useState, useEffect, useRef} from "react";
import {get} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import EmptyState from "../components/EmptyState";
import {SkeletonCard} from "../components/Skeleton";
import {DEMO_MODE, API_BASE_URL} from "../config";
import "../styles/Downloads.css";

/**
 * Downloads page (v2.3): all 10 platform modules. The Download button
 * opens the DIRECT GitHub release-asset link from the API — the module
 * version always matches the installed app version (version parity).
 * The on-the-fly ZIP endpoint (/api/downloads/{id}) stays as a fallback
 * when the release asset is not published yet.
 */
function Downloads() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [modules, setModules] = useState([]);
    const [versions, setVersions] = useState(null);
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [downloading, setDownloading] = useState(null);

    // Responsive pagination (v3.0): pageSize = grid columns x 2 rows, so
    // two rows of cards fit without scrolling at any width. Columns come
    // from the grid's own width and the CSS minmax(280px, 1fr) — the same
    // formula auto-fit uses — never from the rendered item count (empty
    // tracks collapse, which would shrink the page size on later pages).
    const gridRef = useRef(null);
    const [columns, setColumns] = useState(3);
    const [page, setPage] = useState(1);
    useEffect(() => {
        const measure = () => {
            const w = gridRef.current ? gridRef.current.clientWidth : 0;
            if (w > 0) setColumns(Math.max(1, Math.floor((w + 16) / (280 + 16))));
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [modules.length]);
    const pageSize = columns * 2;
    const pages = Math.max(1, Math.ceil(modules.length / pageSize));
    const safePage = Math.min(page, pages);
    const visibleModules = modules.slice((safePage - 1) * pageSize, safePage * pageSize);

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchAll} = useListFetch(
        async () => Promise.all([
            get("/downloads"),
            get("/downloads/versions").catch(() => null),
        ]),
        [],
        {
            onData: ([list, vers]) => { setModules(Array.isArray(list) ? list : []); setVersions(vers); },
            onError: () => setModules([]),
        },
    );

    // Streaming fallback (only when there is no direct URL): fetch a ZIP
    // of the installed module files from the backend and save it.
    // Direct GitHub release assets are plain <a> links in the markup
    // (not window.open — in-app browsers silently swallow window.open,
    // so the v2.3.0 download button appeared to do nothing).
    const handleDownload = async (mod) => {
        setDownloading(mod.id);
        try {
            const response = await fetch(`${API_BASE_URL}/downloads/${mod.id}`, {
                headers: {Authorization: `Bearer ${localStorage.getItem("token") || ""}`},
            });
            if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `licensemanagerpro-${mod.id}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setDownloading(null);
        }
    };

    const latestFor = (id) => {
        if (!versions) return null;
        const v = versions[id];
        return v && (v.latest || v.latest_version) ? (v.latest || v.latest_version) : null;
    };

    if (loading) {
        return (
            <div className="downloads-container page-enter">
                <h1 className="gradient-text">{t("downloads.title")}</h1>
                <SkeletonCard lines={4} />
                <SkeletonCard lines={4} />
            </div>
        );
    }

    return (
        <div className="downloads-container page-enter">
            <h1 className="gradient-text">{t("downloads.title")}</h1>
            {modules.length === 0 ? (
                <EmptyState title={t("common.noData")} />
            ) : (
                <>
                <div className="downloads-grid" ref={gridRef}>
                    {visibleModules.map((mod, i) => {
                        const latest = latestFor(mod.id);
                        const updateAvailable = latest && latest !== mod.version;
                        return (
                            <div key={mod.id} className="download-card glass-card stagger-item" style={{animationDelay: `${i * 70}ms`}}>
                                <h2>{mod.name || mod.id}</h2>
                                <p className="download-version">
                                    {t("downloads.version")}: {mod.version}
                                    {updateAvailable && (
                                        <span className="badge badge-warning">{t("downloads.updateAvailable")}: {latest}</span>
                                    )}
                                </p>
                                <p>{mod.description}</p>
                                <p className="download-install">
                                    {mod.id === "whmcs" ? t("downloads.installWhmcs") : mod.id === "woocommerce" ? t("downloads.installWoo") : t("downloads.installGeneric")}
                                </p>
                                {DEMO_MODE && <p className="download-demo-note">{t("downloads.demoNote")}</p>}
                                {mod.download_url && /^https?:\/\//.test(mod.download_url) ? (
                                    <a className="download-btn" href={mod.download_url} target="_blank" rel="noopener noreferrer">
                                        {t("downloads.download")}
                                    </a>
                                ) : (
                                    <button onClick={() => handleDownload(mod)} disabled={downloading === mod.id}>
                                        {downloading === mod.id ? t("common.loading") : t("downloads.download")}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                {pages > 1 && (
                    <div className="downloads-pager">
                        <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>{t("common.back")}</button>
                        <span>{safePage} / {pages}</span>
                        <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>{t("common.next")}</button>
                    </div>
                )}
                </>
            )}
        </div>
    );
}

export default Downloads;
