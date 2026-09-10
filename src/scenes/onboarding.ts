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
    const focusCtx = await conversation.waitForCallbackQuery(/^focus:(.+)$/);
    const focus = focusCtx.match[1];
    await focusCtx.answerCallbackQuery();
    await focusCtx.editMessageText(`Ціль: ${focus}`);

    // 2. Стать
    await ctx.reply("Крок 2/10: Оберіть вашу стать:", { reply_markup: sexKeyboard });
    const sexCtx = await conversation.waitForCallbackQuery(/^sex:(.+)$/);
    const sex = sexCtx.match[1];
    await sexCtx.answerCallbackQuery();
    await sexCtx.editMessageText(`Стать: ${sex}`);

    // 3. Вік
    await ctx.reply("Крок 3/10: Скільки вам повних років? (наприклад: 28)");
    let age: number;
    while (true) {
        const msgCtx = await conversation.waitFor("message:text");
        const val = parseInt(msgCtx.message.text.trim());
        if (isNaN(val) || val < 14 || val > 100) {
            await ctx.reply("❌ Вік має бути від 14 до 100 років. Введіть правильне число:");
        } else {
            age = val;
            break;
        }
    }

    // 4. Зріст
    await ctx.reply("Крок 4/10: Вкажіть ваш зріст у см (наприклад: 178):");
    let height: number;
    while (true) {
        const msgCtx = await conversation.waitFor("message:text");
        const val = parseInt(msgCtx.message.text.trim());
        if (isNaN(val) || val < 120 || val > 250) {
            await ctx.reply("❌ Зріст має бути від 120 до 250 см. Введіть правильне число:");
        } else {
            height = val;
            break;
        }
    }

    // 5. Поточна вага
    await ctx.reply("Крок 5/10: Ваша поточна вага у кг (наприклад: 75.5):");
    let weight: number;
    while (true) {
        const msgCtx = await conversation.waitFor("message:text");
        const val = parseFloat(msgCtx.message.text.replace(',', '.').trim());
        if (isNaN(val) || val < 35 || val > 250) {
            await ctx.reply("❌ Вага має бути від 35 до 250 кг. Введіть правильне число:");
        } else {
            weight = val;
            break;
        }
    }

    // 6. Бажана вага (з розумною валідацією)
    let targetWeight: number;

    // Якщо ціль - підтримка, ми пропускаємо запитання і ставимо поточну вагу
    if (focus === "Підтримка ваги" || focus === "Підтримка") {
        targetWeight = weight;
        await ctx.reply(`Крок 6/10: Оскільки ваша ціль «${focus}», цільова вага автоматично встановлена на ${weight} кг. ⚖️`);
    } else {
        await ctx.reply("Крок 6/10: Яка ваша цільова (бажана) вага у кг? (наприклад: 70.0):");
        while (true) {
            const msgCtx = await conversation.waitFor("message:text");
            const val = parseFloat(msgCtx.message.text.replace(',', '.').trim());

            if (isNaN(val) || val < 35 || val > 250) {
                await ctx.reply("❌ Вага має бути від 35 до 250 кг. Введіть правильне число:");
                continue;
            }

            // Логіка для схуднення та набору
            if (focus === "Схуднення" && val >= weight) {
                await ctx.reply("❌ Ви обрали ціль «Схуднення», тому бажана вага має бути МЕНШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }
            if (focus === "Набір маси" && val <= weight) {
                await ctx.reply("❌ Ви обрали ціль «Набір маси», тому бажана вага має бути БІЛЬШОЮ за поточну. Спробуйте ще раз:");
                continue;
            }

            // Захист від анорексії (ІМТ < 16)
            const heightM = height / 100;
            const targetBMI = val / (heightM * heightM);
            if (targetBMI < 16) {
                const minWeight = Math.ceil(16 * heightM * heightM);
                await ctx.reply(`❌ Ця вага є критично низькою для вашого зросту (ІМТ < 16). З міркувань здоров'я, введіть безпечнішу ціль (мінімум ${minWeight} кг):`);
                continue;
            }

            targetWeight = val;
            break;
        }
    }

    // 7. Тренування
    await ctx.reply("Крок 7/10: Скільки тренувань на тиждень плануєте? (від 0 до 7):");
    let workouts: number;
    while (true) {
        const msgCtx = await conversation.waitFor("message:text");
        const val = parseInt(msgCtx.message.text.trim());
        if (isNaN(val) || val < 0 || val > 7) {
            await ctx.reply("❌ Будь ласка, введіть число від 0 до 7:");
        } else {
            workouts = val;
            break;
        }
    }

    // 8. Бюджет
    await ctx.reply("Крок 8/10: Орієнтовний бюджет на тиждень у грн (наприклад: 1800):");
    let budget: number;
    while (true) {
        const msgCtx = await conversation.waitFor("message:text");
        const val = parseInt(msgCtx.message.text.trim());
        if (isNaN(val) || val < 500 || val > 100000) {
            await ctx.reply("❌ Бюджет має бути від 500 до 100 000 грн. Введіть коректну суму:");
        } else {
            budget = val;
            break;
        }
    }

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