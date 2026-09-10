import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot";
import { api } from "../api/client";
import { getUser } from "../db";

export const profileHandler = new Composer<MyContext>();

profileHandler.hears("⚙️ Мої параметри", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    try {
        const s = await api.getSettings(user.jwt_token);
        console.log("ВІДПОВІДЬ БЕКЕНДА:", s);
        const msg =
            `⚙️ *Ваші збережені параметри:*\n\n` +
            `👤 Стать / Вік: ${s.sex}, ${s.age} р.\n` +
            `📏 Зріст: ${s.height} см\n` +
            `⚖️ Вага: ${s.weight} кг ➔ Ціль: ${s.target_weight} кг\n` +
            `🎯 Фокус: ${s.focus}\n` +
            `🏋️‍♂️ Тренувань на тиждень: ${s.workouts_per_week}\n` +
            `💰 Бюджет: ${s.weekly_budget} грн\n` +
            `🚫 Алергени: ${s.allergens?.length ? s.allergens.join(", ") : "Немає"}\n` +
            `🛑 Стоп-продукти: ${s.excluded_products?.length ? s.excluded_products.join(", ") : "Немає"}\n` +
            `⚠️ Пропуск тренування: ${s.missed_workout_today ? "ТАК" : "НІ"}`;

        const editKeyboard = new InlineKeyboard()
            .text("⚖️ Вага", "edit_weight")
            .text("🎯 Ціль", "edit_focus").row()
            .text("💰 Бюджет", "edit_budget")
            .text("🚫 Алергени", "edit_allergens").row()
            .text("🔄 Пройти анкету заново", "edit_all");

        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: editKeyboard });
    } catch {
        await ctx.reply("Не вдалося завантажити параметри. Можливо, профіль ще не заповнено.");
    }
});

profileHandler.hears("🏋️‍♂️ Пропустив тренування", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    try {
        const s = await api.getSettings(user.jwt_token);
        const updatedStatus = !s.missed_workout_today;
        await api.updateSettings({ missed_workout_today: updatedStatus }, user.jwt_token);

        await ctx.reply(
            updatedStatus
                ? "⚠️ Позначено: ви пропустили сьогодні тренування. Раціон адаптується зі зниженим калоражем."
                : "✅ Статус скинуто: сьогодні за планом звичайний день."
        );
    } catch {
        await ctx.reply("Помилка оновлення статусу тренування.");
    }
});

// Обробники інлайн-кнопок (безпечні)
profileHandler.callbackQuery("edit_weight", async (ctx) => { await ctx.answerCallbackQuery().catch(() => null); await ctx.conversation.enter("editWeightConversation"); });
profileHandler.callbackQuery("edit_focus", async (ctx) => { await ctx.answerCallbackQuery().catch(() => null); await ctx.conversation.enter("editFocusConversation"); });
profileHandler.callbackQuery("edit_budget", async (ctx) => { await ctx.answerCallbackQuery().catch(() => null); await ctx.conversation.enter("editBudgetConversation"); });
profileHandler.callbackQuery("edit_allergens", async (ctx) => { await ctx.answerCallbackQuery().catch(() => null); await ctx.conversation.enter("editAllergensConversation"); });
profileHandler.callbackQuery("edit_all", async (ctx) => { await ctx.answerCallbackQuery().catch(() => null); await ctx.conversation.enter("onboardingConversation"); });