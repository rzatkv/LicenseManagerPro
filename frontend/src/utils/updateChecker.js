import {get, post} from "./api";

/**
 * بررسی به‌روزرسانی سیستم
 * @returns {Promise<boolean>} - بازگرداندن true اگر نسخه جدید موجود باشد
 */
export const checkForUpdates = async () => {
    try {
        const data = await get("/system/check-updates");
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
        await post("/system/update", {});
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
