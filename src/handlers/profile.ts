import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot";
import { api } from "../api/client";
import { getUser, saveUser } from "../db";
import { mainMenuKeyboard } from "../keyboards";

// Створюємо "міні-бота" для обробки профілю
export const profileHandler = new Composer<MyContext>();

profileHandler.command("start", async (ctx) => {
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


profileHandler.command("onboarding", async (ctx) => {
    await ctx.conversation.enter("onboardingConversation");
});

profileHandler.hears("⚙️ Мої параметри", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    try {
        const s = await api.getSettings(user.jwt_token);
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

// Кнопка та команда логіну
profileHandler.hears("🛒 Сільпо Токен", async (ctx) => {
    // Старый текст: "Для підключення акаунта Сільпо скористайтесь командою /login"
    await ctx.reply(
        "🛒 *Підключення Сільпо*\n\n" +
        "Щоб надати AI-агенту доступ до вашого кошика, відправте команду `/token` разом із вашим токеном через пробіл.\n\n" +
        "*Приклад:*\n`/token 5e1c10ca-0378-4523-abd4...`",
        { parse_mode: "Markdown" }
    );
});

profileHandler.command("token", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку відправте /start");

    // Получаем текст, который юзер ввел после /token
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
        // Отправляем токен на ваш бекенд (метод мы уже добавили в api/client.ts ранее)
        await api.setSilpoToken(silpoToken, user.jwt_token);

        await ctx.api.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            "✅ *Токен Сільпо успішно збережено!*\nТепер AI-агент має доступ до вашої корзини. Можете генерировати раціон!",
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        const err = error as Error;
        await ctx.api.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            `❌ Ошибка сохранения токена: ${err.message}`
        );
    }
});

// Обробники інлайн-кнопок
profileHandler.callbackQuery("edit_weight", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter("editWeightConversation"); });
profileHandler.callbackQuery("edit_focus", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter("editFocusConversation"); });
profileHandler.callbackQuery("edit_budget", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter("editBudgetConversation"); });
profileHandler.callbackQuery("edit_allergens", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter("editAllergensConversation"); });
profileHandler.callbackQuery("edit_all", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter("onboardingConversation"); });
