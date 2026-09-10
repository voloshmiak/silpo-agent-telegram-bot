import { type Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { config } from "../config";
import { getUser } from "../db";
import type { MyContext } from "../bot";

export type MyConversation = Conversation<MyContext>;

// Відповідність бейджів до емодзі, оскільки в ТГ немає CSS-кольорів
const badgeColors: Record<string, string> = {
    "ВИЛУЧЕНО": "🔴",
    "СПРОЩЕНО": "🟢",
    "СІЛЬПО": "🛒",
    "КАЛОРІЇ": "🎯",
    "БІЛОК": "🥩",
    "СНЕКИ": "🥪"
};

export async function feedbackConversation(cv: MyConversation, ctx: MyContext) {
    // Дістаємо ID плану з сесії (збережемо його туди перед запуском сцени)
    const planId = ctx.match ? ctx.match[1] : ctx.callbackQuery?.data?.replace("feedback_plan:", "");

    if (!planId) {
        await ctx.reply("❌ Помилка: не знайдено ID плану.");
        return;
    }

    const user = getUser(ctx.from!.id);
    if (!user) return;

    await ctx.reply("⏳ Завантажую страви для оцінки...");

    // 1. Отримуємо план з бекенду (загортаємо ВЕСЬ асинхронний процес у cv.external)
    let planData;
    try {
        planData = await cv.external(async () => {
            const response = await fetch(`${config.API_BASE_URL}/plans/${planId}`, {
                headers: { Authorization: `Bearer ${user.jwt_token}` }
            });

            if (!response.ok) {
                throw new Error(`Помилка сервера: ${response.status}`);
            }

            const plan = await response.json() as any;
            const parsedContent = typeof plan.content === "string" ? JSON.parse(plan.content) : plan.content;
            return parsedContent.plan_data || parsedContent;
        });
    } catch (e) {
        console.error("❌ Помилка завантаження плану для фідбеку:", e);
        await ctx.reply("❌ Не вдалося завантажити меню. Перевірте консоль для деталей.");
        return; // Зупиняємо сцену
    }

    const days = planData.days || [];
    if (days.length === 0) return ctx.reply("❌ У цьому плані немає меню для оцінки.");

    // 2. Витягуємо УНІКАЛЬНІ страви
    const uniqueDishes = new Map<string, string>(); // title -> fake_id
    let dishCounter = 1;
    for (const d of days) {
        if (d.breakfast?.title) uniqueDishes.set(d.breakfast.title, `dish_${dishCounter++}`);
        if (d.lunch?.title) uniqueDishes.set(d.lunch.title, `dish_${dishCounter++}`);
        if (d.snack?.title) uniqueDishes.set(d.snack.title, `dish_${dishCounter++}`);
        if (d.dinner?.title) uniqueDishes.set(d.dinner.title, `dish_${dishCounter++}`);
    }

    const dishArray = Array.from(uniqueDishes.entries());
    const ratings: any[] = [];

    await ctx.reply("🍽️ *Оцінка страв*\nОцініть страви, які ви куштували цього тижня:", { parse_mode: "Markdown" });

    // 3. По черзі питаємо про кожну страву
    for (const [title, id] of dishArray) {
        const kb = new InlineKeyboard()
            .text("👍", `rate:good`)
            .text("😐", `rate:neutral`)
            .text("👎", `rate:bad`).row()
            .text("⏭ Пропустити", `rate:skip`);

        await ctx.reply(`Як вам: *${title}*?`, { parse_mode: "Markdown", reply_markup: kb });

        const rateCtx = await cv.waitForCallbackQuery(/^rate:(.+)$/);
        const rating = rateCtx.match[1];
        await rateCtx.answerCallbackQuery();

        // Оновлюємо повідомлення (прибираємо кнопки)
        const textRating = rating === "good" ? "👍" : rating === "neutral" ? "😐" : rating === "bad" ? "👎" : "⏭ Пропущено";
        await rateCtx.editMessageText(`*${title}*\nОцінка: ${textRating}`, { parse_mode: "Markdown" });

        if (rating !== "skip") {
            ratings.push({ id, title, cookedTimes: 1, timeMinutes: 30, rating });
        }
    }

    // 4. Швидкі теги (працюють як чекбокси)
    let selectedTags: string[] = [];
    const availableTags = ["Занадто складно готувати", "Набридла курка", "Дорого", "Мало м'яса", "Хочу солодкого", "Не наїдаюся"];

    let tagsMessage = await ctx.reply("Крок 2. Чи є загальні зауваження до раціону?\nОберіть теги або натисніть «Відправити»:");

    while (true) {
        const kb = new InlineKeyboard();
        availableTags.forEach((t, i) => {
            const prefix = selectedTags.includes(t) ? "✅ " : "";
            kb.text(`${prefix}${t}`, `tag:${i}`).row();
        });
        kb.text("➡️ Далі", "tags:done");

        await ctx.api.editMessageReplyMarkup(ctx.chat!.id, tagsMessage.message_id, { reply_markup: kb }).catch(() => null);

        const tagCtx = await cv.waitForCallbackQuery(/^(tag:\d+|tags:done)$/);
        await tagCtx.answerCallbackQuery();

        if (tagCtx.match[0] === "tags:done") break;

        const parts = tagCtx.match[0].split(":");
        const tagIdxStr = parts[1];
        if (!tagIdxStr) continue;
        const tagIdx = parseInt(tagIdxStr);
        const tagStr = availableTags[tagIdx];
        if (tagStr && selectedTags.includes(tagStr)) {
            selectedTags = selectedTags.filter(t => t !== tagStr); // Прибираємо
        } else if (tagStr) {
            selectedTags.push(tagStr); // Додаємо
        }
    }

    // Прибираємо клавіатуру з тегами
    await ctx.api.editMessageText(ctx.chat!.id, tagsMessage.message_id, "✅ Теги вибрано.", { reply_markup: undefined }).catch(() => null);

    // --- НОВИЙ КРОК: Власний коментар ---
    const skipKb = new InlineKeyboard().text("⏭ Пропустити", "skip_comment");
    const commentMsg = await ctx.reply("✍️ Крок 3. Напишіть власний коментар або побажання для агента (або натисніть «Пропустити»):", { reply_markup: skipKb });

    // Чекаємо або текст від юзера, або клік по кнопці "Пропустити"
    const commentCtx = await cv.waitFor(["message:text", "callback_query:data"]);

    if (commentCtx.callbackQuery?.data === "skip_comment") {
        await commentCtx.answerCallbackQuery().catch(() => null);
        await ctx.api.editMessageText(ctx.chat!.id, commentMsg.message_id, "✍️ Коментар: _Пропущено_", { parse_mode: "Markdown" }).catch(() => null);
    } else if (commentCtx.message?.text) {
        // Додаємо текст юзера в масив тегів!
        selectedTags.push(commentCtx.message.text);
        await ctx.api.editMessageText(ctx.chat!.id, commentMsg.message_id, `✍️ Коментар: _${commentCtx.message.text}_`, { parse_mode: "Markdown" }).catch(() => null);
    }

    const loadingMsg = await ctx.reply("⏳ Обробка фідбеку та генерація рішень...");

    // 5. Відправка на бекенд (виправлений варіант для уникнення DataCloneError)
    try {
        const payload = { plan_id: planId, dish_ratings: ratings, tags: selectedTags };

        const data = await cv.external(async () => {
            const res = await fetch(`${config.API_BASE_URL}/feedbacks`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.jwt_token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }

            // Повертаємо вже розпарսений JSON, а не об'єкт Response!
            return await res.json() as any;
        });

        // Перевіримо, що прийшло з бекенду (можеш глянути в консоль, якщо що)
        console.log("📦 Відповідь бекенду на фідбек:", JSON.stringify(data, null, 2));

        let finalMsg = `📝 *Фідбек успішно збережено!*\n\n`;

        if (data.summary) {
            finalMsg += `_${data.summary}_\n\n`;
        }

        finalMsg += `*Рішення AI-агента:*\n`;

        // Універсальна обробка рішень (перевіряємо різні можливі назви полів)
        const decisionsList = data.decisions || data.agent_decisions || data.actions || [];

        if (Array.isArray(decisionsList) && decisionsList.length > 0) {
            decisionsList.forEach((d: any) => {
                // Підтримуємо різні ключі від бекенду (badge або type, text або description)
                const badgeName = d.badge || d.type || "ІНФО";
                const badgeText = d.text || d.description || d.message || JSON.stringify(d);
                const icon = badgeColors[badgeName] || "🔹";

                finalMsg += `\n${icon} *[${badgeName}]* ${badgeText}`;
            });
        } else {
            finalMsg += "\n🔹 Агент оновив параметри раціону на основі ваших оцінок.";
        }

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            finalMsg,
            { parse_mode: "Markdown" }
        );

    } catch (e) {
        console.error("❌ Помилка відправки фідбеку:", e);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            "❌ Помилка відправки фідбеку на сервер."
        ).catch(() => null);
    }
}