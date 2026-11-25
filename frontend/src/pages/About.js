import React, {useState, useEffect} from "react";
import {get, post} from "../utils/api";
import {formatDate} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import "../styles/About.css";

/**
 * About + Updates (v2.2).
 *
 * The Updates card checks GitHub live (GET /api/system/update-check) and
 * shows current vs latest version plus release notes. "Update now" stages
 * the latest release tarball (POST /api/system/update) — nothing live is
 * touched. The apply step is scripts/update.sh: the backend runs it
 * automatically only when LMP_ALLOW_SELF_UPDATE=1, otherwise the admin
 * runs the printed one-liner by hand.
 */
function About() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [version, setVersion] = useState("");
    const [lastUpdated, setLastUpdated] = useState("");
    const [check, setCheck] = useState(null);
    const [checking, setChecking] = useState(false);
    const [staged, setStaged] = useState(null);
    const [staging, setStaging] = useState(false);

    useEffect(() => {
        const fetchAppInfo = async () => {
            try {
                const data = await get("/system/info");
                setVersion(data.version);
                setLastUpdated(data.lastUpdated);
            } catch (err) {
                console.error("Failed to fetch application info.");
            }
        };
        fetchAppInfo();
    }, []);

    const handleCheck = async () => {
        setChecking(true);
        try {
            const data = await get("/system/update-check");
            setCheck(data);
            if (data.error) toast.error(data.error);
        } catch (err) {
            toast.error(err.message || t("updates.failed"));
        } finally {
            setChecking(false);
        }
    };

    const handleUpdate = async () => {
        setStaging(true);
        try {
            const data = await post("/system/update", {});
            setStaged(data);
            toast.success(t("updates.stagedDone"));
        } catch (err) {
            toast.error(err.message || t("about.updateFailed"));
        } finally {
            setStaging(false);
        }
    };

    return (
        <div className="about-container page-enter">
            <h1 className="gradient-text">{t("about.title")}</h1>
            <div className="about-info">
                <p><strong>{t("about.version")}:</strong> {version}</p>
                <p><strong>{t("about.lastUpdated")}:</strong> {lastUpdated ? formatDate(lastUpdated, lang) : ""}</p>
            </div>

            <div className="updates-card glass-card">
                <h2>{t("updates.title")}</h2>
                <p><strong>{t("updates.current")}:</strong> {version || "-"}</p>
                {check && (
                    <>
                        <p><strong>{t("updates.latest")}:</strong> {check.latest_version || "-"}</p>
                        {check.update_available ? (
                            <p>{t("updates.available")}</p>
                        ) : (
                            <p>{t("updates.upToDate")}</p>
                        )}
                        {check.release_notes && (
                            <details>
                                <summary>{t("updates.releaseNotes")}</summary>
                                <pre>{check.release_notes}</pre>
                            </details>
                        )}
                        {check.release_url && (
                            <p><a href={check.release_url} target="_blank" rel="noopener noreferrer">{check.release_url}</a></p>
                        )}
                    </>
                )}
                <div className="row-actions">
                    <button onClick={handleCheck} disabled={checking}>
                        {checking ? t("updates.checking") : t("updates.check")}
                    </button>
                    {check && check.update_available && (
                        <button onClick={handleUpdate} disabled={staging}>
                            {staging ? t("updates.staging") : t("updates.updateNow")}
                        </button>
                    )}
                </div>
                {staged && staged.staged && (
                    <div className="staged-note">
                        <p>{t("updates.staged")}</p>
                        <pre>{staged.next_step}</pre>
                    </div>
                )}
                <p className="hint">{t("updates.autoDisabled")}</p>
            </div>
        </div>
    );
}

export default About;
