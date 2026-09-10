import { Bot, Context, session } from "grammy";
import type { SessionFlavor } from "grammy";
import {
    conversations,
    createConversation,
    type ConversationFlavor,
} from "@grammyjs/conversations";
import { config } from "./config";

// --- ТИПИ КОНТЕКСТУ ---
export type MyContext = Context & SessionFlavor<Record<string, unknown>> & ConversationFlavor<Context>;

// Імпортуємо сцени
import { onboardingConversation } from "./scenes/onboarding";
import {
    editWeightConversation,
    editFocusConversation,
    editBudgetConversation,
    editAllergensConversation
} from "./scenes/edit";

// Імпортуємо наші розбиті хендлери
import { startHandler } from "./handlers/start";
import { tokenHandler } from "./handlers/token";
import { profileHandler } from "./handlers/profile";
import { generationHandler } from "./handlers/generation";
// import { historyHandler } from "./handlers/history"; // Підключимо, коли відновимо історію

export const bot = new Bot<MyContext>(config.BOT_TOKEN);

// 1. Глобальна обробка помилок (щоб бот не падав)
bot.catch((err) => {
    console.error("❌ Помилка бота:", err);
});

// 2. Підключення базових мідлварів (обов'язково до хендлерів!)
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// 3. Реєстрація сцен (діалогів)
bot.use(createConversation(onboardingConversation as any, "onboardingConversation"));
bot.use(createConversation(editWeightConversation as any, "editWeightConversation"));
bot.use(createConversation(editFocusConversation as any, "editFocusConversation"));
bot.use(createConversation(editBudgetConversation as any, "editBudgetConversation"));
bot.use(createConversation(editAllergensConversation as any, "editAllergensConversation"));

// 4. Підключення хендлерів з бізнес-логікою
bot.use(startHandler);     // Обробляє /start
bot.use(tokenHandler);     // Обробляє "Сільпо Токен" та /token
bot.use(profileHandler);   // Обробляє "Мої параметри" та зміну даних
bot.use(generationHandler);// Обробляє генерацію раціону

// 5. Запуск
console.log("🚀 Бот запущений...");
bot.start();