export const config = {
    BOT_TOKEN: process.env.BOT_TOKEN || "",
    API_BASE_URL: (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, ""),
};

if (!config.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in environment variables!");
}