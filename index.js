const TelegramBot = require("node-telegram-bot-api");
const { addRow, getRows } = require("./google");
const fetch = require("node-fetch");

const TOKEN = "8751440371:AAG4xANHS16f1PFWDWBKiT8aRhCj54NGsAQ"; // твій токен
const bot = new TelegramBot(TOKEN, { polling: true });

const userState = {};
const currencies = ["UAH", "USD", "EUR"];

// 💱 Кешовані курси валют
let cachedRates = null;
let lastRatesUpdate = 0;

async function getRates() {
  const now = Date.now();
  if (!cachedRates || now - lastRatesUpdate > 3600000) {
    // оновлюємо раз на годину
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/UAH");
    cachedRates = await res.json();
    lastRatesUpdate = now;
  }
  return cachedRates;
}

// 📊 Кешовані дані таблиці
let cachedRows = null;
let lastRowsUpdate = 0;

async function getCachedRows() {
  const now = Date.now();
  if (!cachedRows || now - lastRowsUpdate > 60000) {
    // оновлюємо раз на хвилину
    cachedRows = await getRows();
    lastRowsUpdate = now;
  }
  return cachedRows;
}

// ▶️ START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Обери дію:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏦 Банк", callback_data: "bank" }],
        [{ text: "💸 Витрата", callback_data: "expense" }],
      ],
    },
  });
});

// 🎯 КНОПКИ
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 🏦 Банку — одразу показує витрати
  if (data === "bank") {
    bot.sendMessage(chatId, "⏳ Обробляю запит...");

    const rows = await getCachedRows();
    const rates = await getRates();

    let expense = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] == chatId && rows[i][1] === "expense") {
        let amount = parseFloat(rows[i][2]);
        const currency = rows[i][3];
        if (currency !== "UAH") {
          amount *= rates.rates[currency];
        }
        expense += amount;
      }
    }

    bot.sendMessage(chatId, `🏦 Банк:\nВитрати: ${expense.toFixed(2)} UAH`);
  }

  // 💸 Витрата — обираєш валюту
  else if (data === "expense") {
    userState[chatId] = { type: "expense" };

    bot.sendMessage(chatId, "Валюта:", {
      reply_markup: {
        inline_keyboard: currencies.map((c) => [
          { text: c, callback_data: "cur_" + c },
        ]),
      },
    });
  }

  // після вибору валюти → вводимо суму
  else if (data.startsWith("cur_")) {
    userState[chatId].currency = data.replace("cur_", "");
    userState[chatId].step = "amount";
    bot.sendMessage(chatId, "Введи суму:");
  }
});

// 💾 ВВЕДЕННЯ СУМИ та категорії
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId]) return;

  if (userState[chatId].step === "amount") {
    const amount = parseFloat(msg.text);
    if (isNaN(amount)) return bot.sendMessage(chatId, "❗ Введи число");

    userState[chatId].amount = amount;
    userState[chatId].step = "category";
    bot.sendMessage(chatId, "На що витратив?");
  } else if (userState[chatId].step === "category") {
    const category = msg.text;

    const data = [
      chatId,
      "expense",
      userState[chatId].amount,
      userState[chatId].currency,
      category,
      new Date().toISOString(),
    ];

    await addRow(data);

    bot.sendMessage(
      chatId,
      `✅ Записано витрату: ${userState[chatId].amount} ${userState[chatId].currency} на ${category}`,
    );

    // оновлюємо кеш таблиці після запису
    cachedRows = null;

    delete userState[chatId];
  }
});

// 📊 STATS
bot.onText(/\/stats/, async (msg) => {
  bot.sendMessage(msg.chat.id, "⏳ Обробляю статистику...");

  const rows = await getCachedRows();
  const chatId = msg.chat.id;
  const rates = await getRates();

  const stats = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == chatId && rows[i][1] === "expense") {
      const category = rows[i][4];
      let amount = parseFloat(rows[i][2]);
      const currency = rows[i][3];

      if (currency !== "UAH") {
        amount *= rates.rates[currency];
      }

      if (!stats[category]) stats[category] = 0;
      stats[category] += amount;
    }
  }

  let text = "📊 Статистика витрат (UAH):\n";
  for (let key in stats) {
    text += `${key}: ${stats[key].toFixed(2)}\n`;
  }

  bot.sendMessage(chatId, text);
});

// 🧾 HISTORY
bot.onText(/\/history/, async (msg) => {
  const rows = await getCachedRows();
  const chatId = msg.chat.id;

  let text = "🧾 Останні витрати:\n";
  let count = 0;

  for (let i = rows.length - 1; i > 0 && count < 5; i--) {
    if (rows[i][0] == chatId && rows[i][1] === "expense") {
      text += `${rows[i][2]} ${rows[i][3]} | ${rows[i][4]}\n`;
      count++;
    }
  }

  bot.sendMessage(chatId, text);
});
