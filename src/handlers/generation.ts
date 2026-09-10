import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot";
import { streamPlan } from "../api/sse";
import { getUser } from "../db";

export const generationHandler = new Composer<MyContext>();

// Зберігаємо ID користувачів, від яких чекаємо введення побажань
const awaitingNote = new Set<number>();

const dayNames: Record<string, string> = {
    monday: "Понеділок", tuesday: "Вівторок", wednesday: "Середа",
    thursday: "Четвер", friday: "П'ятниця", saturday: "Субота", sunday: "Неділя"
};

// Форматуємо меню страв
function formatMenu(days: any[]): string {
    if (!days || !Array.isArray(days) || days.length === 0) return "";

    let text = "🍽️ *Ваше меню:*\n";
    days.forEach(d => {
        const dayName = dayNames[d.day] || d.day;
        const workout = d.workout ? " 🏋️‍♂️" : "";
        text += `\n🔹 *${dayName}*${workout}\n`;

        if (d.breakfast) text += `🍳 Сніданок: ${d.breakfast.title}\n`;
        if (d.lunch) text += `🍲 Обід: ${d.lunch.title}\n`;
        if (d.snack) text += `🥪 Перекус: ${d.snack.title}\n`;
        if (d.dinner) text += `🥗 Вечеря: ${d.dinner.title}\n`;
    });

    return text + "\n";
}

// Обробник помилок стрімінгу
export async function handleStreamError(ctx: MyContext, err: Error, loadingMsgId: number, telegram_id: string) {
    console.error("❌ Stream error:", err.message);
    const errorStr = err.message;

    if (errorStr.includes("silpo token unavailable") || errorStr.includes("rejected") || errorStr.includes("expired")) {
        await ctx.api.editMessageText(
            ctx.chat!.id, loadingMsgId,
            "🛒 *Потрібна авторизація!*\n\nВаш токен доступу до Сільпо відхилено, відсутній або застарів.\n\nОновіть його командою:\n`/token ВАШ_ТОКЕН`",
            { parse_mode: "Markdown" }
        ).catch(() => null);
    } else {
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, `❌ Помилка генерації: ${errorStr}`).catch(() => null);
    }
}

// Загальна функція для стрімінгу, щоб не дублювати код
export async function runStreaming(ctx: MyContext, loadingMsgId: number, user: any, params: any) {
    let currentText = "";
    let lastEditTime = 0;

    // ВМИКАЄМО apply: true, щоб бекенд одразу наповнював кошик
    const streamParams = { ...params, apply: true };

    for await (const event of streamPlan(streamParams, user.jwt_token)) {
        const ev = event as any;

        if (ev.type === "error" || ev.error) {
            throw new Error(String(ev.message || ev.error || ev.text));
        }
        else if (ev.type === "tool_call") {
            const toolMsg = `🔍 *AI аналізує:* \`${ev.tool}\`...`;
            await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, toolMsg, { parse_mode: "Markdown" }).catch(() => null);
        }
        else if (ev.type === "token") {
            currentText += ev.text || "";
            const now = Date.now();
            if (now - lastEditTime > 1500 && currentText.trim().length > 0) {
                await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, currentText + " ✍️", { parse_mode: "Markdown" }).catch(() => null);
                lastEditTime = now;
            }
        }
        else if (ev.type === "plan") {
            let finalMessage = ev.answer || "";

            // Якщо бекенд не дав готового тексту, але дав JSON з планом, збираємо повідомлення самі
            if (!finalMessage && ev.plan) {
                const summary = ev.plan.summary;
                const targets = ev.plan.targets;
                const cart = ev.plan.cart || [];
                const days = ev.plan.days || []; // ❗️ Правильне джерело масиву днів

                finalMessage = `✅ *Раціон успішно згенеровано!*\n\n`;

                if (targets) {
                    finalMessage += `🎯 *Ціль:* ${targets.kcal} ккал (Б: ${targets.protein_g}г, Ж: ${targets.fat_g}г, В: ${targets.carbs_g}г)\n`;
                }

                if (summary?.notes) {
                    finalMessage += `📝 *Коротко:* ${summary.notes}\n\n`;
                }

                // ❗️ Додаємо генерацію меню з правильної змінної
                if (days.length > 0) {
                    finalMessage += formatMenu(days);
                }

                if (cart.length > 0) {
                    finalMessage += `🛒 *Список продуктів:*\n`;
                    cart.forEach((item: any) => {
                        finalMessage += `• ${item.name} — ${item.quantity} ${item.unit} (*${item.total_price} грн*)\n`;
                    });
                }

                if (summary) {
                    finalMessage += `\n💰 *Загальна сума:* ${summary.total_uah} грн (вкл. доставку ${summary.delivery_uah} грн)\n`;
                    if (summary.discount_uah > 0) {
                        finalMessage += `🎁 *Економія на акціях:* ${summary.discount_uah} грн\n`;
                    }
                }
            }

            // 🛡 ЗАХИСТ ВІД ПОМИЛКИ порожнього тексту
            if (!finalMessage || finalMessage.trim() === "") {
                finalMessage = "✅ Раціон успішно згенеровано!\n_(AI-агент зберіг план, але не надіслав текстового опису)_";
            }

            try {
                await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, finalMessage, { parse_mode: "Markdown" });
            } catch (err) {
                console.warn("⚠️ Помилка Markdown, відправляємо як звичайний текст...");
                await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, finalMessage.replace(/[*_`]/g, '')).catch(() => null);
            }

            // Одразу відправляємо кнопку-посилання на кошик
            if (ev.plan) {
                const cartKeyboard = new InlineKeyboard().url("🛒 Відкрити Сільпо", "https://silpo.ua");

                await ctx.reply(
                    "✅ *Всі товари вже додано до вашого кошика!*\nПерейдіть на сайт Сільпо, щоб перевірити та оплатити.",
                    { parse_mode: "Markdown", reply_markup: cartKeyboard }
                );
            }
        }
    }
}

// 1. КОРИСТУВАЧ ТИСНЕ КНОПКУ ГЕНЕРАЦІЇ
generationHandler.hears("🥗 Згенерувати раціон", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    // Записуємо юзера в стан "очікує на введення тексту"
    awaitingNote.add(ctx.from!.id);

    const skipKeyboard = new InlineKeyboard().text("➡️ Пропустити", "skip_note");

    await ctx.reply(
        "✍️ *Чи є у вас особливі побажання на цей раз?*\n\nНаприклад: _«без курки», «більше риби», «хочу солодкого»_.\n\nНапишіть ваше побажання текстом прямо сюди, або натисніть кнопку нижче, щоб згенерувати стандартне меню.",
        { parse_mode: "Markdown", reply_markup: skipKeyboard }
    );
});

// 2. ЯКЩО КОРИСТУВАЧ НАТИСНУВ "ПРОПУСТИТИ"
generationHandler.callbackQuery("skip_note", async (ctx) => {
    const userId = ctx.from.id;

    if (!awaitingNote.has(userId)) return ctx.answerCallbackQuery("Запит неактуальний.");

    awaitingNote.delete(userId);
    await ctx.answerCallbackQuery().catch(() => null);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => null);

    const user = getUser(userId);
    if (!user) return;

    const loadingMsg = await ctx.reply("⏳ *SilpoFit* починає генерацію...", { parse_mode: "Markdown" });
    try {
        await runStreaming(ctx, loadingMsg.message_id, user, {});
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});

// 3. ЯКЩО КОРИСТУВАЧ НАПИСАВ ТЕКСТ (ПОБАЖАННЯ)
generationHandler.on("message:text", async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // Якщо ми не чекаємо побажання від цього юзера — пропускаємо повідомлення далі
    if (!awaitingNote.has(userId)) return next();

    // Перелік усіх кнопок нашого головного меню
    const menuButtons = [
        "🥗 Згенерувати раціон",
        "⚙️ Мої параметри",
        "🛒 Сільпо Токен",
        "🏋️‍♂️ Пропустив тренування",
        "📜 Історія"
    ];

    // Якщо це системна команда або користувач передумав і натиснув кнопку меню
    if (text.startsWith("/") || menuButtons.includes(text)) {
        awaitingNote.delete(userId); // Скасовуємо режим очікування
        return next(); // Передаємо повідомлення далі (щоб відкрився профіль чи історія)
    }

    // Все супер, це реальне побажання! Забираємо юзера зі списку очікування
    awaitingNote.delete(userId);
    const user = getUser(userId);
    if (!user) return;

    const loadingMsg = await ctx.reply(`📝 Враховую побажання: *${text}*\n⏳ Генерую раціон...`, { parse_mode: "Markdown" });

    try {
        await runStreaming(ctx, loadingMsg.message_id, user, { note: text });
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});