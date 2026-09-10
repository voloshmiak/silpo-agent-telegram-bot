import { type Conversation } from "@grammyjs/conversations";
import { api } from "../api/client";
import { getUser } from "../db";
import { sexKeyboard, focusKeyboard, mainMenuKeyboard } from "../keyboards";
import type { UserSettings } from "../api/types";
import type { MyContext } from "../bot";

export type MyConversation = Conversation<MyContext>;

export async function onboardingConversation(
    conversation: MyConversation,
    ctx: MyContext
) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = getUser(telegramId);
    if (!user) {
        await ctx.reply("Спочатку надішліть /start");
        return;
    }

    // 1. Ціль
    await ctx.reply("Крок 1/10: Оберіть головний фокус (ціль):", { reply_markup: focusKeyboard });
    const focusCtx = await conversation.waitForCallbackQuery(/^focus:(.+)$/); // ❗️ Змінили
    const focus = focusCtx.match[1]; // ❗️ Змінили
    await focusCtx.answerCallbackQuery();
    await focusCtx.editMessageText(`Ціль: ${focus}`);

    // 2. Бажана вага
    await ctx.reply("Крок 2/8: Яка ваша цільова (бажана) вага у кг? (наприклад: 70.0):");
    const targetWeight = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть число (цільова вага):")
    );

    // 3. Поточна вага
    await ctx.reply("Крок 3/8: Ваша поточна вага у кг (наприклад: 75.5):");
    const weight = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть число (вага у кг):")
    );

    // 4. Стать
    await ctx.reply("Крок 4/10: Оберіть вашу стать:", { reply_markup: sexKeyboard });
    const sexCtx = await conversation.waitForCallbackQuery(/^sex:(.+)$/); // ❗️ Змінили
    const sex = sexCtx.match[1]; // ❗️ Змінили
    await sexCtx.answerCallbackQuery();
    await sexCtx.editMessageText(`Стать: ${sex}`);

    // 5. Вік
    await ctx.reply("Крок 5/8: Скільки вам повних років? (наприклад: 28)");
    const age = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть число (вік):")
    );

    // 6. Зріст
    await ctx.reply("Крок 6/8: Вкажіть ваш зріст у см (наприклад: 178):");
    const height = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть число (зріст у см):")
    );

    // 7. Тренування
    await ctx.reply("Крок 7/8: Скільки тренувань на тиждень плануєте? (від 0 до 7):");
    const workouts = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть число від 0 до 7:")
    );

    // 8. Бюджет
    await ctx.reply("Крок 8/8: Орієнтовний бюджет на тиждень у грн (наприклад: 1800):");
    const budget = await conversation.form.number((ctx) =>
        ctx.reply("⚠️ Будь ласка, введіть суму у грн:")
    );

    // 9. Алергени
    await ctx.reply("Крок 9/10: 🚫 Чи є у вас харчові алергії? Напишіть їх через кому (наприклад: лактоза, горіхи).\n\nЯкщо немає, просто відправте «ні» або «-»:");
    const allergensInput = await conversation.form.text();
    const allergens = (allergensInput.toLowerCase() === 'ні' || allergensInput === '-')
        ? []
        : allergensInput.split(',').map(item => item.trim());

    // 10. Стоп-продукти
    await ctx.reply("Крок 10/10: 🛑 Які продукти ви категорично не їсте? Напишіть через кому (наприклад: свинина, гриби, кінза).\n\nЯкщо таких немає, відправте «ні» або «-»:");
    const excludedInput = await conversation.form.text();
    const excludedProducts = (excludedInput.toLowerCase() === 'ні' || excludedInput === '-')
        ? []
        : excludedInput.split(',').map(item => item.trim());

    await ctx.reply("⏳ Зберігаю ваш профіль у SilpoFit...");

    const settingsPayload: Partial<UserSettings> = {
        sex,
        age,
        height,
        weight,
        target_weight: targetWeight,
        focus,
        weekly_pace: focus === "Схуднення" ? -0.5 : focus === "Набір маси" ? 0.3 : 0,
        workouts_per_week: workouts,
        workout_schedule: {
            "ПН": workouts > 0 ? "силові" : "відпочинок",
            "СР": workouts > 1 ? "кардіо" : "відпочинок",
            "ПТ": workouts > 2 ? "силові" : "відпочинок",
        },
        missed_workout_today: false,
        allergens: allergens,
        excluded_products: excludedProducts,
        diet_type: "БЕЗ ОБМЕЖЕНЬ",
        weekly_budget: budget,
        promo_priority: "Високий",
        delivery_included: true,
    };

    try {
        await api.updateSettings(settingsPayload, user.jwt_token);
        await ctx.reply("🎉 Профіль успішно налаштовано! Тепер можна генерувати тижневий раціон.", {
            reply_markup: mainMenuKeyboard,
        });
    } catch (error) {
        console.error("Save settings error:", error);
        await ctx.reply("❌ Помилка збереження налаштувань. Спробуйте пізніше.");
    }
}