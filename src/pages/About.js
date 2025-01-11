import React, {useState, useEffect} from "react";
import "../styles/About.css";

function About() {
    const [version, setVersion] = useState("");
    const [lastUpdated, setLastUpdated] = useState("");
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        const fetchAppInfo = async () => {
            try {
                const response = await fetch("/api/system/info", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setVersion(data.version);
                    setLastUpdated(data.lastUpdated);
                } else {
                    console.error("Failed to fetch application info.");
                }
            } catch (err) {
                console.error("An error occurred while fetching application info.");
            }
        };

        const checkForUpdates = async () => {
            try {
                const response = await fetch("/api/system/check-updates", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setUpdateAvailable(data.updateAvailable);
                }
            } catch (err) {
                console.error("An error occurred while checking for updates.");
            }
        };

        fetchAppInfo();
        checkForUpdates();
    }, []);

    const handleUpdate = async () => {
        try {
            const response = await fetch("/api/system/update", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (response.ok) {
                alert("The system has been updated successfully!");
                setUpdateAvailable(false);
            } else {
                alert("Failed to update the system.");
            }
        } catch (err) {
            alert("An error occurred while updating the system.");
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