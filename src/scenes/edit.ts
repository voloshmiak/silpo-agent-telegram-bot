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
    const user = getUser(ctx.from!.id);
    if (!user) return;

    // Отримуємо поточні дані, щоб знати ціль і зріст
    const currentSettings = await api.getSettings(user.jwt_token);
    const focus = currentSettings.focus;
    const height = currentSettings.height || 170; // Запобіжник

    await ctx.reply("⚖️ Введіть вашу нову поточну вагу у кг (наприклад: 72.5):");

    let weight: number;
    while (true) {
        const msgCtx = await cv.waitFor("message:text");
        const val = parseFloat(msgCtx.message.text.replace(',', '.').trim());

        if (isNaN(val) || val < 35 || val > 250) {
            await ctx.reply("❌ Вага має бути від 35 до 250 кг. Введіть правильне число:");
        } else {
            weight = val;
            break;
        }
    }

    let target_weight = currentSettings.target_weight;

    if (focus === "Підтримка ваги" || focus === "Підтримка") {
        target_weight = weight;
        await ctx.reply("ℹ️ Оскільки ваша ціль «Підтримка ваги», цільова вага також автоматично оновлена.");
    } else {
        await ctx.reply(`🎯 Ваша ціль — «${focus}».\nВведіть нову бажану вагу у кг:`);
        while (true) {
            const msgCtx = await cv.waitFor("message:text");
            const val = parseFloat(msgCtx.message.text.replace(',', '.').trim());

            if (isNaN(val) || val < 35 || val > 250) {
                await ctx.reply("❌ Вага має бути від 35 до 250 кг. Введіть правильне число:");
                continue;
            }

            if (focus === "Схуднення" && val >= weight) {
                await ctx.reply("❌ Для схуднення бажана вага має бути МЕНШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }
            if (focus === "Набір маси" && val <= weight) {
                await ctx.reply("❌ Для набору маси бажана вага має бути БІЛЬШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }

            const heightM = height / 100;
            const targetBMI = val / (heightM * heightM);
            if (targetBMI < 16) {
                const minWeight = Math.ceil(16 * heightM * heightM);
                await ctx.reply(`❌ Ця вага є критично низькою (ІМТ < 16). Введіть мінімум ${minWeight} кг:`);
                continue;
            }

            target_weight = val;
            break;
        }
    }

    await updateAndReply(ctx, { weight, target_weight });
}

// 2. Редагування цілі
export async function editFocusConversation(cv: MyConversation, ctx: MyContext) {
    const user = getUser(ctx.from!.id);
    if (!user) return;

    const currentSettings = await api.getSettings(user.jwt_token);
    const weight = currentSettings.weight || 70;
    const height = currentSettings.height || 170;

    await ctx.reply("🎯 Оберіть нову ціль:", { reply_markup: focusKeyboard });

    const focusCtx = await cv.waitForCallbackQuery(/^focus:(.+)$/);
    const focus = focusCtx.match[1];
    await focusCtx.answerCallbackQuery();

    let weekly_pace = 0;
    if (focus === "Схуднення") weekly_pace = -0.5;
    if (focus === "Набір маси") weekly_pace = 0.3;

    let target_weight = currentSettings.target_weight;

    if (focus === "Підтримка ваги" || focus === "Підтримка") {
        target_weight = weight;
        await ctx.reply(`ℹ️ Оскільки ви обрали «${focus}», ваша цільова вага буде автоматично прирівняна до поточної (${weight} кг).`);
    } else {
        await ctx.reply(`ℹ️ Вашу ціль змінено на «${focus}».\nЯка ваша нова цільова (бажана) вага у кг? (Ваша поточна: ${weight} кг):`);
        while (true) {
            const msgCtx = await cv.waitFor("message:text");
            const val = parseFloat(msgCtx.message.text.replace(',', '.').trim());

            if (isNaN(val) || val < 35 || val > 250) {
                await ctx.reply("❌ Вага має бути від 35 до 250 кг. Введіть правильне число:");
                continue;
            }

            if (focus === "Схуднення" && val >= weight) {
                await ctx.reply("❌ Для схуднення бажана вага має бути МЕНШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }
            if (focus === "Набір маси" && val <= weight) {
                await ctx.reply("❌ Для набору маси бажана вага має бути БІЛЬШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }

            const heightM = height / 100;
            const targetBMI = val / (heightM * heightM);
            if (targetBMI < 16) {
                const minWeight = Math.ceil(16 * heightM * heightM);
                await ctx.reply(`❌ Ця вага є критично низькою (ІМТ < 16). Введіть мінімум ${minWeight} кг:`);
                continue;
            }

            target_weight = val;
            break;
        }
    }

    await updateAndReply(ctx, { focus, weekly_pace, target_weight });
}

// 3. Редагування бюджету
export async function editBudgetConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("💰 Введіть новий орієнтовний бюджет на тиждень у грн (від 500 до 100 000):");

    let weekly_budget: number;
    while (true) {
        const msgCtx = await cv.waitFor("message:text");
        const val = parseInt(msgCtx.message.text.trim());

        if (isNaN(val) || val < 500 || val > 100000) {
            await ctx.reply("❌ Бюджет має бути від 500 до 100 000 грн. Введіть коректну суму:");
        } else {
            weekly_budget = val;
            break;
        }
    }

    await updateAndReply(ctx, { weekly_budget });
}

// 4. Редагування алергенів та стоп-продуктів
export async function editAllergensConversation(cv: MyConversation, ctx: MyContext) {
    await ctx.reply("Крок 1/2: 🚫 Напишіть ваші харчові алергії через кому (або «ні»):");
    const msg1 = await cv.waitFor("message:text");
    const input1 = msg1.message.text;
    const allergens = (input1.toLowerCase() === 'ні' || input1 === '-') ? [] : input1.split(',').map(i => i.trim());

    await ctx.reply("Крок 2/2: 🛑 Які продукти ви категорично не їсте? (або «ні»):");
    const msg2 = await cv.waitFor("message:text");
    const input2 = msg2.message.text;
    const excluded_products = (input2.toLowerCase() === 'ні' || input2 === '-') ? [] : input2.split(',').map(i => i.trim());

    await updateAndReply(ctx, { allergens, excluded_products });
}