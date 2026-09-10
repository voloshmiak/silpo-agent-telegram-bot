import { Composer } from "grammy";
import type { MyContext } from "../bot";
import { streamPlan } from "../api/sse";
import { getUser } from "../db";

// Створюємо "міні-бота" для генерації
export const generationHandler = new Composer<MyContext>();

async function handleStreamError(ctx: MyContext, err: Error, loadingMsgId: number, telegram_id: string) {
    console.error("❌ Stream error:", err.message);
    const errorStr = err.message;

    if (errorStr.includes("silpo token unavailable") || errorStr.includes("rejected") || errorStr.includes("expired")) {
        // Замість кнопки просто пишемо інструкцію
        await ctx.api.editMessageText(
            ctx.chat!.id, loadingMsgId,
            "🛒 *Потрібна авторизація!*\n\nВаш токен доступу до Сільпо відхилено, відсутній або застарів.\n\nБудь ласка, оновіть його за допомогою команди:\n`/token ВАШ_ТОКЕН`\n\n_(Токен можна скопіювати з Local Storage вашого сайту)_",
            { parse_mode: "Markdown" }
        ).catch(() => null);
    } else {
        await ctx.api.editMessageText(
            ctx.chat!.id, loadingMsgId,
            `❌ Помилка генерації: ${errorStr}`
        ).catch(() => null);
    }
}

generationHandler.hears("🥗 Згенерувати раціон", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    const loadingMsg = await ctx.reply("⏳ *SilpoFit* аналізує ваші параметри та починає генерацію...", { parse_mode: "Markdown" });

    try {
        let currentText = "";
        let lastEditTime = 0;
        console.log("📡 Підключаємось до бекенду (SSE)...");

        for await (const event of streamPlan({}, user.jwt_token)) {
            const ev = event as any;
            if (ev.type === "error" || ev.error) {
                const errorMessage = ev.message || ev.error || ev.text || JSON.stringify(event);
                throw new Error(String(errorMessage));
            }
            else if (event.type === "tool_call") {
                const toolMsg = `🔍 *AI аналізує:* \`${event.tool}\`...`;
                await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, toolMsg, { parse_mode: "Markdown" }).catch(() => null);
            }
            else if (event.type === "token") {
                currentText += event.text || "";
                const now = Date.now();
                if (now - lastEditTime > 1500) {
                    await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, currentText + " ✍️", { parse_mode: "Markdown" }).catch(() => null);
                    lastEditTime = now;
                }
            }
            else if (event.type === "plan") {
                currentText = event.answer || currentText;
                await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, currentText, { parse_mode: "Markdown" }).catch(() => null);
                if (event.plan) {
                    await ctx.reply("🛒 *Ваш кошик продуктів успішно сформовано!*", { parse_mode: "Markdown" });
                }
            }
        }
        console.log("✅ Стрімінг успішно завершено!");
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});

generationHandler.command("fridge", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    const fridgeItems = ctx.match?.trim();
    if (!fridgeItems) return ctx.reply("ℹ️ Вкажіть продукти через кому. Формат: `/fridge яйця, помідори, сир`", { parse_mode: "Markdown" });

    const loadingMsg = await ctx.reply(`🥚 Враховую продукти: *${fridgeItems}*\n⏳ Генерую раціон...`, { parse_mode: "Markdown" });

    try {
        let currentText = "";
        let lastEditTime = 0;
        console.log(`📡 Підключаємось до бекенду (SSE) з fridge=${fridgeItems}...`);

        for await (const event of streamPlan({ fridge: fridgeItems }, user.jwt_token)) {
            const ev = event as any;
            if (ev.type === "error" || ev.error) {
                const errorMessage = ev.message || ev.error || ev.text || JSON.stringify(event);
                throw new Error(String(errorMessage));
            }
            else if (event.type === "tool_call") {
                const toolMsg = `🔍 *AI аналізує:* \`${event.tool}\`...`;
                await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, toolMsg, { parse_mode: "Markdown" }).catch(() => null);
            }
            else if (event.type === "token") {
                currentText += event.text || "";
                const now = Date.now();
                if (now - lastEditTime > 1500) {
                    await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, currentText + " ✍️", { parse_mode: "Markdown" }).catch(() => null);
                    lastEditTime = now;
                }
            } else if (event.type === "plan") {
                await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, event.answer || currentText, { parse_mode: "Markdown" }).catch(() => null);
            }
        }
        console.log("✅ Стрімінг (fridge) успішно завершено!");
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});