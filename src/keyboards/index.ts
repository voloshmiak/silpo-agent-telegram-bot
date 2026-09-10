import { Keyboard, InlineKeyboard } from "grammy";

// Головне меню
export const mainMenuKeyboard = new Keyboard()
    .text("🥗 Згенерувати раціон")
    .text("⚙️ Мої параметри")
    .row()
    .text("🛒 Сільпо Токен")
    .text("🏋️‍♂️ Пропустив тренування")
    .row() // <--- Додаємо новий рядок
    .text("📜 Історія") // <--- Повертаємо нашу кнопку!
    .resized();

// Inline-кнопки для онбординга (вибір статі)
export const sexKeyboard = new InlineKeyboard()
    .text("Чоловіча 👨", "sex:чол.")
    .text("Жіноча 👩", "sex:жін.");

// Inline-кнопки для цілі
export const focusKeyboard = new InlineKeyboard()
    .text("Схуднення 📉", "focus:Схуднення")
    .row()
    .text("Підтримка форми ⚖️", "focus:Підтримка")
    .row()
    .text("Набір маси 📈", "focus:Набір маси");