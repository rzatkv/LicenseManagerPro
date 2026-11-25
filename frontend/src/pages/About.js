import React, {useState, useEffect} from "react";
import {get, post} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import "../styles/About.css";

function About() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [version, setVersion] = useState("");
    const [lastUpdated, setLastUpdated] = useState("");
    const [updateAvailable, setUpdateAvailable] = useState(false);

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
        const checkForUpdates = async () => {
            try {
                const data = await get("/system/check-updates");
                setUpdateAvailable(data.updateAvailable);
            } catch (err) {
                console.error("An error occurred while checking for updates.");
            }
        };
        fetchAppInfo();
        checkForUpdates();
    }, []);

    const handleUpdate = async () => {
        try {
            await post("/system/update", {});
            toast.success(t("about.updated"));
            setUpdateAvailable(false);
        } catch (err) {
            toast.error(err.message || t("about.updateFailed"));
        }
    };

    return (
        <div className="about-container page-enter">
            <h1 className="gradient-text">{t("about.title")}</h1>
            <div className="about-info">
                <p><strong>{t("about.version")}:</strong> {version}</p>
                <p><strong>{t("about.lastUpdated")}:</strong> {lastUpdated}</p>
            </div>
            {updateAvailable ? (
                <div className="update-section">
                    <p>{t("about.updateAvailable")}</p>
                    <button onClick={handleUpdate}>{t("about.updateNow")}</button>
                </div>
            ) : (
                <p>{t("about.upToDate")}</p>
            )}
        </div>
    );
}

export default About;
