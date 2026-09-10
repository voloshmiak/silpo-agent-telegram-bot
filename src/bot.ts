import { Bot, Context, session } from "grammy";
import type { SessionFlavor } from "grammy";
import {
    conversations,
    createConversation,
    type ConversationFlavor,
} from "@grammyjs/conversations";
import { config } from "./config";

// --- ТИПИ КОНТЕКСТУ ЗАЛИШАЮТЬСЯ ТУТ ---
export type MyContext = Context & SessionFlavor<Record<string, unknown>> & ConversationFlavor<Context>;

// Імпортуємо сцени
import { onboardingConversation } from "./scenes/onboarding";
import {
    editWeightConversation,
    editFocusConversation,
    editBudgetConversation,
    editAllergensConversation
} from "./scenes/edit";

// Імпортуємо наші нові хендлери
import { profileHandler } from "./handlers/profile";
import { generationHandler } from "./handlers/generation";
// import { loginConversation } from "./scenes/login";

export const bot = new Bot<MyContext>(config.BOT_TOKEN);

// 1. Підключення базових мідлварів
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// 2. Реєстрація сцен (діалогів)
bot.use(createConversation(onboardingConversation as any, "onboardingConversation"));
bot.use(createConversation(editWeightConversation as any, "editWeightConversation"));
bot.use(createConversation(editFocusConversation as any, "editFocusConversation"));
bot.use(createConversation(editBudgetConversation as any, "editBudgetConversation"));
bot.use(createConversation(editAllergensConversation as any, "editAllergensConversation"));
// bot.use(createConversation(loginConversation as any, "loginConversation"));

// 3. Підключення хендлерів з бізнес-логікою
bot.use(profileHandler);
bot.use(generationHandler);

// 4. Запуск
console.log("🚀 Бот запущений...");
bot.start();