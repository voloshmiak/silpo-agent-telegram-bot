import { Composer } from "grammy";
import type { MyContext } from "../bot";
import { api } from "../api/client";
import { getUser } from "../db";

export const tokenHandler = new Composer<MyContext>();

tokenHandler.hears("🛒 Сільпо Токен", async (ctx) => {
    await ctx.reply(
        "🛒 *Підключення Сільпо*\n\n" +
        "Щоб надати AI-агенту доступ до вашого кошика, відправте команду `/token` разом із вашим токеном через пробіл.\n\n" +
        "*Приклад:*\n`/token 5e1c10ca-0378-4523-abd4...`",
        { parse_mode: "Markdown" }
    );
});

tokenHandler.command("token", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку відправте /start");

    const silpoToken = ctx.match.trim();

    if (!silpoToken) {
        return ctx.reply(
            "🛒 *Підключення Сільпо*\n\n" +
            "Будь ласка, відправте команду разом з вашим токеном через пробіл.\n\n" +
            "*Приклад:*\n`/token 5e1c10ca-0378-4523-abd4...`",
            { parse_mode: "Markdown" }
        );
    }

    const loadingMsg = await ctx.reply("⏳ Зберігаю токен...");

    try {
        await api.setSilpoToken(silpoToken, user.jwt_token);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            "✅ *Токен Сільпо успішно збережено!*\nТепер AI-агент має доступ до вашої корзини. Можете генерировати раціон!",
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        const err = error as Error;
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Помилка: ${err.message}`);
    }
});