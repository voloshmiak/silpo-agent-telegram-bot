import { Keyboard, InlineKeyboard } from "grammy";

// Главное меню
export const mainMenuKeyboard = new Keyboard()
    .text("🥗 Згенерувати раціон")
    .text("⚙️ Мої параметри")
    .row()
    .text("🛒 Сільпо Токен")
    .text("🏋️‍♂️ Пропустив тренування")
    .resized();

// Inline-кнопки для онбординга (выбор пола)
export const sexKeyboard = new InlineKeyboard()
    .text("Чоловіча 👨", "sex:чол.")
    .text("Жіноча 👩", "sex:жін.");

// Inline-кнопки для цели
export const focusKeyboard = new InlineKeyboard()
    .text("Схуднення 📉", "focus:Схуднення")
    .row()
    .text("Підтримка форми ⚖️", "focus:Підтримка")
    .row()
    .text("Набір маси 📈", "focus:Набір маси");