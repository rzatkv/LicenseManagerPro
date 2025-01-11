/**
 * بررسی به‌روزرسانی سیستم
 * @returns {Promise<boolean>} - بازگرداندن true اگر نسخه جدید موجود باشد
 */
export const checkForUpdates = async () => {
    try {
        const response = await fetch("/api/system/check-updates", {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to check for updates");
        }

        const data = await response.json();
        return data.updateAvailable;
    } catch (error) {
        console.error("Error checking for updates:", error);
        throw error;
    }
};

/**
 * اجرای به‌روزرسانی سیستم
 * @returns {Promise<void>}
 */
export const performUpdate = async () => {
    try {
        const response = await fetch("/api/system/update", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to update the system");
        }

        alert("System updated successfully!");
    } catch (error) {
        console.error("Error performing update:", error);
        alert("Failed to update the system. Please try again.");
    }
};

/**
 * نمایش نوتیفیکیشن برای به‌روزرسانی
 * @param {boolean} updateAvailable - وضعیت به‌روزرسانی
 */
export const showUpdateNotification = (updateAvailable) => {
    if (updateAvailable) {
        alert("A new system update is available! Please check the About section.");
    }
};