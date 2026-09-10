import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot"; // Переконайся, що шлях до типу правильний
import { getUser } from "../db";
import { config } from "../config";
import { runStreaming, handleStreamError } from "./generation";

export const historyHandler = new Composer<MyContext>();

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

// Форматування дати: 2026-09-06T14:20:21Z -> 06.09.2026, 14:20
function formatDate(dateString: string): string {
    const d = new Date(dateString);
    return d.toLocaleString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// Спільна функція для показу списку історії (викликається командою або кнопкою)
async function showHistory(ctx: MyContext) {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start для авторизації.");

    const loadingMsg = await ctx.reply("⏳ Завантажую історію раціонів...");

    try {
        const response = await fetch(`${config.API_BASE_URL}/plans?limit=5&offset=0`, {
            headers: { Authorization: `Bearer ${user.jwt_token}` }
        });

        if (!response.ok) throw new Error("Помилка сервера");

        const plans = await response.json() as any[];

        if (!plans || plans.length === 0) {
            return ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, "📭 У вас ще немає збережених раціонів.");
        }

        const keyboard = new InlineKeyboard();
        plans.forEach((plan: any) => {
            const dateStr = formatDate(plan.created_at);
            // Додаємо кнопку для кожного плану
            keyboard.text(`📅 Раціон за ${dateStr}`, `view_plan_${plan.id}`).row();
        });

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            "📚 *Ваша історія раціонів:*\nОберіть меню, щоб переглянути деталі.",
            { parse_mode: "Markdown", reply_markup: keyboard }
        );

    } catch (error) {
        console.error("❌ History fetch error:", error);
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, "❌ Не вдалося завантажити історію.");
    }
}

// Підключаємо обидва тригери
historyHandler.command("history", showHistory);
historyHandler.hears("📜 Історія", showHistory);

// Обробник кліку по конкретному плану для перегляду деталей
historyHandler.callbackQuery(/view_plan_(.+)/, async (ctx) => {
    // Одразу відповідаємо Телеграму, щоб не було таймауту
    await ctx.answerCallbackQuery().catch(() => null);

    const planId = ctx.match[1];
    const user = getUser(ctx.from!.id);
    if (!user) return;

    const loadingMsg = await ctx.reply("⏳ Завантажую деталі...");

    try {
        const response = await fetch(`${config.API_BASE_URL}/plans/${planId}`, {
            headers: { Authorization: `Bearer ${user.jwt_token}` }
        });

        if (!response.ok) throw new Error("Помилка завантаження плану");
        const plan = await response.json() as any;

        // Безпечно парсимо контент (іноді він може вже бути об'єктом)
        const parsedContent = typeof plan.content === "string" ? JSON.parse(plan.content) : plan.content;

        // Універсальний парсинг (шукаємо дані там, де вони є)
        const planData = parsedContent.plan_data || parsedContent;
        const summary = planData.summary || {};
        const targets = planData.targets;
        const days = planData.days || [];
        // Шукаємо кошик в cart або cart_items
        const cart = planData.cart || planData.cart_items || [];

        // Будуємо красивий чек
        let finalMessage = `📅 *Раціон від ${formatDate(plan.created_at)}*\n\n`;

        if (targets) {
            finalMessage += `🎯 *Ціль:* ${targets.kcal} ккал (Б: ${targets.protein_g}г, Ж: ${targets.fat_g}г, В: ${targets.carbs_g}г)\n`;
        }

        if (summary.notes) {
            finalMessage += `📝 *Коротко:* ${summary.notes}\n\n`;
        }

        // ❗️ ВИВОДИМО МЕНЮ
        if (days.length > 0) {
            finalMessage += formatMenu(days);
        }

        if (cart.length > 0) {
            finalMessage += `🛒 *Список продуктів:*\n`;
            cart.forEach((item: any) => {
                const price = item.total_price || item.price || 0;
                const unit = item.unit || "шт";
                finalMessage += `• ${item.name} — ${item.quantity} ${unit} (*${price} грн*)\n`;
            });
        } else {
            finalMessage += `🛒 *Список продуктів:*\n_(Дані про кошик не збереглися)_\n`;
        }

        if (summary.total_uah) {
            finalMessage += `\n💰 *Загальна сума:* ${summary.total_uah} грн\n`;
        } else if (planData.budget_uah) {
            finalMessage += `\n💰 *Бюджет:* ${planData.budget_uah} грн\n`;
        }

        // Кнопка для застосування цього плану
        const applyKeyboard = new InlineKeyboard()
            .url("🛒 Відкрити Сільпо", "https://silpo.ua").row()
            .text("🔄 Зібрати кошик знову", `rebuild_cart:${planId}`);

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            finalMessage,
            { parse_mode: "Markdown", reply_markup: applyKeyboard }
        ).catch(async () => {
            // Фолбек, якщо вилізе помилка розмітки Markdown
            await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, finalMessage.replace(/[*_`]/g, ''), { reply_markup: applyKeyboard }).catch(() => null);
        });

    } catch (error) {
        console.error("❌ Plan fetch error:", error);
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, "❌ Помилка завантаження деталей плану.");
    }
});

// Обробник для кнопки "Зібрати кошик знову"
historyHandler.callbackQuery(/^rebuild_cart:(.+)$/, async (ctx) => {
    // Прибираємо годинник-завантаження з кнопки
    await ctx.answerCallbackQuery().catch(() => null);

    const planId = ctx.match[1];
    const user = getUser(ctx.from!.id);
    if (!user) return;

    const loadingMsg = await ctx.reply("⏳ *SilpoFit* починає відновлення кошика...", { parse_mode: "Markdown" });

    try {
        // Викликаємо твою готову функцію генерації, передаючи ID старого плану!
        await runStreaming(ctx, loadingMsg.message_id, user, { plan_id: planId });
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});