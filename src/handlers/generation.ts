import { Composer, InlineKeyboard } from "grammy";
import type { MyContext } from "../bot";
import { streamPlan } from "../api/sse";
import { getUser } from "../db";

export const generationHandler = new Composer<MyContext>();

async function handleStreamError(ctx: MyContext, err: Error, loadingMsgId: number, telegram_id: string) {
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
async function runStreaming(ctx: MyContext, loadingMsgId: number, user: any, params: any) {
    let currentText = "";
    let lastEditTime = 0;

    // ДОДАЄМО apply: false, щоб не купувати одразу
    const streamParams = { ...params, apply: false };

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

                finalMessage = `✅ *Раціон успішно згенеровано!*\n\n`;

                if (targets) {
                    finalMessage += `🎯 *Ціль:* ${targets.kcal} ккал (Б: ${targets.protein_g}г, Ж: ${targets.fat_g}г, В: ${targets.carbs_g}г)\n`;
                }

                if (summary?.notes) {
                    finalMessage += `📝 *Коротко:* ${summary.notes}\n\n`;
                }

                if (cart.length > 0) {
                    finalMessage += `🛒 *Список продуктів для кошика:*\n`;
                    cart.forEach((item: any) => {
                        // Виводимо: • Банан — 2.5 кг (179.15 грн)
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

            // 🛡 ЗАХИСТ ВІД ПОМИЛКИ 400
            if (!finalMessage || finalMessage.trim() === "") {
                finalMessage = "✅ Раціон успішно згенеровано!\n_(AI-агент зберіг план, але не надіслав текстового опису)_";
            }

            try {
                await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, finalMessage, { parse_mode: "Markdown" });
            } catch (err) {
                console.warn("⚠️ Помилка Markdown, відправляємо як звичайний текст...");
                // Якщо в назвах продуктів попадуться спецсимволи, відправляємо без Markdown
                await ctx.api.editMessageText(ctx.chat!.id, loadingMsgId, finalMessage.replace(/[*_`]/g, '')).catch(() => null);
            }

            if (ev.plan) {
                // Витягуємо ID плану (у твоєму JSON він лежить у ev.run_id)
                const planId = ev.run_id || "latest";
                const confirmKeyboard = new InlineKeyboard()
                    .text("✅ Підтвердити та зібрати кошик", `apply_cart_${planId}`);

                await ctx.reply(
                    "Ознайомтесь із списком покупок вище. Якщо все подобається, натисніть кнопку, щоб додати ці товари в кошик Сільпо.",
                    { reply_markup: confirmKeyboard }
                );
            }
        }
    }
}

generationHandler.hears("🥗 Згенерувати раціон", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    const loadingMsg = await ctx.reply("⏳ *SilpoFit* починає генерацію...", { parse_mode: "Markdown" });
    try {
        await runStreaming(ctx, loadingMsg.message_id, user, {});
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});

generationHandler.command("fridge", async (ctx) => {
    const user = getUser(ctx.from!.id);
    if (!user) return ctx.reply("Спочатку надішліть /start");

    const fridgeItems = ctx.match?.trim();
    if (!fridgeItems) return ctx.reply("ℹ️ Вкажіть продукти. Формат: `/fridge яйця, помідори`", { parse_mode: "Markdown" });

    const loadingMsg = await ctx.reply(`🥚 Враховую: *${fridgeItems}*\n⏳ Генерую...`, { parse_mode: "Markdown" });
    try {
        await runStreaming(ctx, loadingMsg.message_id, user, { fridge: fridgeItems });
    } catch (error) {
        await handleStreamError(ctx, error as Error, loadingMsg.message_id, user.telegram_id.toString());
    }
});

// ОБРОБНИК КНОПКИ ПІДТВЕРДЖЕННЯ
generationHandler.callbackQuery(/apply_cart_(.+)/, async (ctx) => {
    // 1. ОДРАЗУ відповідаємо Телеграму, щоб уникнути таймауту і помилки 400!
    await ctx.answerCallbackQuery().catch(() => null);

    const planId = ctx.match[1];
    const user = getUser(ctx.from.id);
    if (!user) {
        await ctx.reply("❌ Помилка авторизації");
        return;
    }

    // 2. Прибираємо кнопку
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => null);
    const loadingMsg = await ctx.reply("🛒 Зв'язуюсь із Сільпо та додаю продукти...");

    try {
        console.log(`📡 Відправляємо підтвердження для плану ${planId}...`);

        // 3. ВИКЛИКАЄМО БЕКЕНД: передаємо ID плану і apply: true
        const stream = streamPlan({ plan_id: planId, apply: true }, user.jwt_token);

        for await (const event of stream) {
            const ev = event as any;
            if (ev.type === "error" || ev.error) {
                throw new Error(String(ev.message || ev.error || ev.text));
            }
        }

        const cartKeyboard = new InlineKeyboard().url("🛒 Відкрити Сільпо", "https://silpo.ua");

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            "✅ *Готово! Продукти успішно додані до кошика.*\nПерейдіть на сайт Сільпо, щоб перевірити та оплатити.",
            { parse_mode: "Markdown", reply_markup: cartKeyboard }
        );
    } catch (error) {
        console.error("❌ Помилка додавання в кошик:", error);
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, "❌ Сталася помилка при додаванні товарів у кошик.");
    }
});