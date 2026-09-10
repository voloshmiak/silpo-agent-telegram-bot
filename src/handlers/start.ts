import { Composer } from "grammy";
import type { MyContext } from "../bot";
import { api } from "../api/client";
import { getUser, saveUser } from "../db";
import { mainMenuKeyboard } from "../keyboards";

export const startHandler = new Composer<MyContext>();

startHandler.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    const name = ctx.from?.first_name || "Користувач";

    if (!telegramId) return;

    try {
        let userRecord = getUser(telegramId);

        if (!userRecord) {
            await ctx.reply("⏳ Підключаю вас до SilpoFit...");
            const response = await api.createUser({ name });
            const token = response.token;
            const userId = response.user?.id || `tg_${telegramId}`;
            saveUser(telegramId, token, userId);
            userRecord = { telegram_id: telegramId, jwt_token: token, user_id: userId };
        }

        await ctx.reply(
            `👋 Привіт, *${name}*!\n\n` +
            `Я — **SilpoFit**, твій персональний AI-нутріціолог та асистент покупок у «Сільпо».\n\n` +
            `Давай налаштуємо твої параметри, щоб раціон був ідеальним.`,
            { parse_mode: "Markdown", reply_markup: mainMenuKeyboard }
        );

        await ctx.conversation.enter("onboardingConversation");
    } catch (error: unknown) {
        const err = error as Error;
        await ctx.reply(`❌ Помилка: ${err?.message || "невідомо"}`);
    }
});

startHandler.command("onboarding", async (ctx) => {
    await ctx.conversation.enter("onboardingConversation");
});