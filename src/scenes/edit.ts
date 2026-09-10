import { type Conversation } from "@grammyjs/conversations";
import { api } from "../api/client";
import { getUser } from "../db";
import { focusKeyboard } from "../keyboards";
import type { UserSettings } from "../api/types";
import type { MyContext } from "../bot";

export type MyConversation = Conversation<MyContext>;

// Безпечне оновлення: отримуємо старі дані, мержимо з новими, відправляємо
async function updateAndReply(ctx: MyContext, payload: Partial<UserSettings>) {
    const user = getUser(ctx.from!.id);
    if (!user) return;

    await ctx.reply("⏳ Оновлюю профіль...");
    try {
        const currentSettings = await api.getSettings(user.jwt_token);
        const updatedSettings = { ...currentSettings, ...payload };

        await api.updateSettings(updatedSettings, user.jwt_token);
        await ctx.reply("✅ Профіль успішно оновлено!\nНатисніть «⚙️ Мої параметри», щоб перевірити результати.");
    } catch (e) {
        await ctx.reply("❌ Помилка оновлення на бекенді.");
    }
}

// 1. Редагування ваги
export async function editWeightConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("⚖️ Введіть вашу нову поточну вагу у кг (наприклад: 72.5):");
    const weight = await cv.form.number();
    await updateAndReply(ctx, { weight });
}

// 2. Редагування цілі
export async function editFocusConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("🎯 Оберіть нову ціль:", { reply_markup: focusKeyboard });

    // ❗️ Змінили регулярку: тепер вона ловить все після "focus:"
    const focusCtx = await cv.waitForCallbackQuery(/^focus:(.+)$/);

    // ❗️ Беремо одразу 1-шу групу збігу (те, що в дужках)
    const focus = focusCtx.match[1];

    await focusCtx.answerCallbackQuery();

    let weekly_pace = 0;
    if (focus === "Схуднення") weekly_pace = -0.5;
    if (focus === "Набір маси") weekly_pace = 0.3;

    await updateAndReply(ctx, { focus, weekly_pace });
}

// 3. Редагування бюджету
export async function editBudgetConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("💰 Введіть новий орієнтовний бюджет на тиждень у грн:");
    const weekly_budget = await cv.form.number();
    await updateAndReply(ctx, { weekly_budget });
}

// 4. Редагування алергенів та стоп-продуктів
export async function editAllergensConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("Крок 1/2: 🚫 Напишіть ваші харчові алергії через кому (або «ні»):");
    const input1 = await cv.form.text();
    const allergens = (input1.toLowerCase() === 'ні' || input1 === '-') ? [] : input1.split(',').map(i => i.trim());

    await ctx.reply("Крок 2/2: 🛑 Які продукти ви категорично не їсте? (або «ні»):");
    const input2 = await cv.form.text();
    const excluded_products = (input2.toLowerCase() === 'ні' || input2 === '-') ? [] : input2.split(',').map(i => i.trim());

    await updateAndReply(ctx, { allergens, excluded_products });
}