import React, {useState, useEffect} from "react";
import {get, post} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/About.css";

function About() {
    const {t} = useLanguage();
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
            alert(t("about.updated"));
            setUpdateAvailable(false);
        } catch (err) {
            alert(t("about.updateFailed"));
        }
    };

    return (
        <div className="about-container">
            <h1>{t("about.title")}</h1>
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
