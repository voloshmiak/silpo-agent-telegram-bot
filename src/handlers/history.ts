import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot";
import { api } from "../api/client";
import { getUser } from "../db";

export const historyHandler = new Composer<MyContext>();

historyHandler.hears("📜 Історія", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    const loading = await ctx.reply("⏳ Завантажую історію...");

    try {
        // Беремо останні 5 раціонів
        const plans = await api.getPlans(user.jwt_token, 5, 0);

        if (!plans || plans.length === 0) {
            return ctx.api.editMessageText(ctx.chat!.id, loading.message_id, "📭 У вас ще немає збережених раціонів.");
        }

        let msg = "📜 *Останні згенеровані раціони:*\n\n";
        const keyboard = new InlineKeyboard();

        plans.forEach((plan, index) => {
            // Форматуємо дату (наприклад: 24 жовт., 14:30)
            const date = new Date(plan.created_at).toLocaleDateString("uk-UA", {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
            });

            msg += `${index + 1}. Раціон від *${date}*\n`;

            // Додаємо кнопку для кожного плану
            keyboard.text(`Подивитися #${index + 1}`, `view_plan:${plan.id}`).row();
        });

        await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, msg, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (error) {
        await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, "❌ Помилка завантаження історії.");
    }
});

// Обробник натискання на кнопку "Подивитися #X"
historyHandler.callbackQuery(/^view_plan:(.+)$/, async (ctx) => {
    const planId = ctx.match?.[1]; // Дістаємо ID плану
    const user = getUser(ctx.from!.id);
    if (!user || !planId) return;

    await ctx.answerCallbackQuery("Завантажую...");

    try {
        const planDetails = await api.getPlanById(planId, user.jwt_token);

        // Тут ми просто виводимо, що план знайдено. 
        // Пізніше ти зможеш розпарсити planDetails.data, як ми це робили в генерації!
        const msg = `✅ *Раціон за ${new Date(planDetails.created_at).toLocaleDateString("uk-UA")}*\n\n` +
            `_Тут можна буде вивести деталі корзини з planDetails.data_`;

        await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch {
        await ctx.answerCallbackQuery({ text: "❌ Не вдалося завантажити деталі.", show_alert: true });
    }
});