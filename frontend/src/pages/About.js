import React, {useState, useEffect} from "react";
import {get, post} from "../utils/api";
import "../styles/About.css";

function About() {
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
            alert("The system has been updated successfully!");
            setUpdateAvailable(false);
        } catch (err) {
            alert("Failed to update the system.");
        }
    };

    return (
        <div className="about-container">
            <h1>About the Software</h1>
            <div className="about-info">
                <p><strong>Version:</strong> {version}</p>
                <p><strong>Last Updated:</strong> {lastUpdated}</p>
            </div>
            {updateAvailable ? (
                <div className="update-section">
                    <p>A new update is available!</p>
                    <button onClick={handleUpdate}>Update Now</button>
                </div>
            ) : (
                <p>The system is up to date.</p>
            )}
        </div>
    );
}

export default About;
