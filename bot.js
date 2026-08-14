// bot.js — ربات قرعه‌کشی تلگرامی
// نصب پیش‌نیاز:  npm install node-telegram-bot-api
// اجرا:           node bot.js
//
// توکن ربات را در متغیر محیطی BOT_TOKEN بگذارید، یا مستقیم در خط پایین جایگزین کنید.
// (⚠️ توکنی که قبلاً در چت فرستادید را حتماً از BotFather ری‌ولوک/تعویض کنید.)

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '8955378151:AAGxpTcLJ2yghxIw9yDo4dsbPmDcaSqHqHg';
const ADMIN_IDS = [8955378151, 8800727588];

const DATA_FILE = path.join(__dirname, 'data.json');

// ---------- ذخیره‌سازی ساده روی فایل JSON ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: {}, lottery: null, lastResults: null };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { users: {}, lottery: null, lastResults: null };
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadData();
// db.users: { [id]: { id, name, chatId, started: true } }
// db.lottery: {
//   capacity, creatorId, adminChatId, adminMsgId,
//   participants: [{id, name}],
//   status: 'collecting' | 'full' | 'finished',
//   participantMsgs: { [userId]: { chatId, msgId } },
//   broadcastMsgs: { [userId]: { chatId, msgId } }  // پیام "شرکت می‌کنم" که برای هرکس فرستاده شده
// }
// db.lastResults: { winners: [{id, name}] }

const bot = new TelegramBot(TOKEN, { polling: true });

function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

function displayName(user) {
  return user.first_name || user.username || 'کاربر';
}

// ---------- کیبوردها ----------
function adminHomeKeyboard() {
  return { inline_keyboard: [[{ text: 'ساخت قرعه‌کشی', callback_data: 'create_lottery' }]] };
}

function capacityKeyboard() {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5, 6].map((n) => ({ text: String(n), callback_data: `cap_${n}` })),
    ],
  };
}

function adminListText(headerLine) {
  const l = db.lottery;
  let lines = [];
  for (let i = 1; i <= l.capacity; i++) {
    const p = l.participants[i - 1];
    lines.push(p ? `${i} ${p.name}` : `${i}`);
  }
  return `${headerLine}\n\nکاربرانی که شرکت کردن\n${lines.join('\n')}`;
}

function adminCollectingText() {
  const l = db.lottery;
  const admin = l.participants[0];
  if (l.participants.length >= l.capacity) {
    return adminListText('واااای\nحالا همه شرکت کردن');
  }
  return `${adminListText('واااای\nحالا منتظر باش تا کاربران در قرعه‌کشی شرکت کنن')}\n\nمنتظر باش ${admin.name} عزیز.....`;
}

function adminCollectingKeyboard() {
  const l = db.lottery;
  if (l.participants.length >= l.capacity) {
    return { inline_keyboard: [[{ text: 'شروع قرعه‌کشی', callback_data: 'start_lottery' }]] };
  }
  return { inline_keyboard: [] };
}

function joinKeyboard() {
  const kb = [[{ text: 'شرکت می‌کنم', callback_data: 'join_lottery' }]];
  if (db.lastResults) {
    kb.push([{ text: 'برندگان قبلی', callback_data: 'prev_winners' }]);
  }
  return { inline_keyboard: kb };
}

// ---------- /start ----------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = displayName(msg.from);

  if (isAdmin(userId)) {
    await bot.sendMessage(
      chatId,
      `سلام عشق من ${name} عزیزم\n\nکاربرانت منتظر هستن تا قرعه‌کشی رو بسازی\nپس دکمه زیر را بزن تا قرعه‌کشی رو بسازی`,
      { reply_markup: adminHomeKeyboard() }
    );
    return;
  }

  // کاربر عادی
  if (db.users[userId] && db.users[userId].started) {
    // ربات برای این کاربر بسته است — پاسخی داده نمی‌شود
    return;
  }

  db.users[userId] = { id: userId, name, chatId, started: true };
  saveData();

  await bot.sendMessage(
    chatId,
    `سلام ${name}\n\nبرای شرکت در قرعه‌کشی منتظر باش تا ادمین قرعه‌کشی رو بسازه.....`
  );
});

// نادیده گرفتن سایر پیام‌های متنی کاربران عادی (پیوی برایشان بسته است)
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/start')) return;
  // ادمین‌ها می‌توانند پیام بدهند بدون واکنش خاص؛ کاربران عادی نادیده گرفته می‌شوند.
});

// ---------- دکمه‌ها ----------
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  try {
    if (data === 'create_lottery') {
      if (!isAdmin(userId)) return bot.answerCallbackQuery(query.id);
      if (db.lottery && db.lottery.status !== 'finished') {
        return bot.answerCallbackQuery(query.id, {
          text: 'یک قرعه‌کشی در حال انجام است.',
          show_alert: true,
        });
      }
      await bot.editMessageText(
        'خب خب خب\nبرای قرعه‌کشی چند نفر به غیر از خودت نیاز داری',
        { chat_id: chatId, message_id: msgId, reply_markup: capacityKeyboard() }
      );
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('cap_')) {
      if (!isAdmin(userId)) return bot.answerCallbackQuery(query.id);
      const capacity = parseInt(data.split('_')[1], 10);
      const name = displayName(query.from);

      db.lottery = {
        capacity,
        creatorId: userId,
        adminChatId: chatId,
        adminMsgId: msgId,
        participants: [{ id: userId, name }],
        status: 'collecting',
        participantMsgs: {},
        broadcastMsgs: {},
      };
      saveData();

      await bot.editMessageText(adminCollectingText(), {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: adminCollectingKeyboard(),
      });
      await bot.answerCallbackQuery(query.id);

      // ارسال دعوت به همه‌ی کاربرانی که استارت کرده‌اند
      const userIds = Object.keys(db.users);
      for (const uid of userIds) {
        const u = db.users[uid];
        try {
          const sent = await bot.sendMessage(
            u.chatId,
            'مدیر عزیز قرعه‌کشی رو ساخت\n\nبرای شرکت در قرعه‌کشی بزن روی دکمه زیر',
            { reply_markup: joinKeyboard() }
          );
          db.lottery.broadcastMsgs[uid] = { chatId: u.chatId, msgId: sent.message_id };
        } catch (e) {
          // کاربر ربات را بلاک کرده یا خطای دیگر — رد می‌شویم
        }
      }
      saveData();
      return;
    }

    if (data === 'join_lottery') {
      const l = db.lottery;
      if (!l || l.status !== 'collecting') {
        return bot.answerCallbackQuery(query.id, {
          text: 'در حال حاضر قرعه‌کشی فعالی وجود ندارد.',
          show_alert: true,
        });
      }
      if (l.participants.some((p) => p.id === userId)) {
        return bot.answerCallbackQuery(query.id, {
          text: 'شما قبلاً شرکت کرده‌اید.',
          show_alert: true,
        });
      }
      if (l.participants.length >= l.capacity) {
        return bot.answerCallbackQuery(query.id, {
          text: 'متاسفانه ظرفیت تکمیل شده است.',
          show_alert: true,
        });
      }

      const name = displayName(query.from);
      l.participants.push({ id: userId, name });
      saveData();

      await bot.answerCallbackQuery(query.id);

      // ادیت پیام خود کاربر
      await bot.editMessageText(
        'منتظر باش تا نتایج قرعه‌کشی را مدیر اعلام کنه.....',
        { chat_id: chatId, message_id: msgId }
      );

      // به‌روزرسانی پیام ادمین
      await bot.editMessageText(adminCollectingText(), {
        chat_id: l.adminChatId,
        message_id: l.adminMsgId,
        reply_markup: adminCollectingKeyboard(),
      });
      return;
    }

    if (data === 'prev_winners') {
      if (!db.lastResults) {
        return bot.answerCallbackQuery(query.id, {
          text: 'هنوز قرعه‌کشی قبلی وجود ندارد.',
          show_alert: true,
        });
      }
      const text = db.lastResults.winners
        .map((w, i) => `${i + 1} ${w.name}`)
        .join('\n');
      return bot.answerCallbackQuery(query.id, {
        text: `برندگان قرعه‌کشی قبلی:\n${text}`,
        show_alert: true,
      });
    }

    if (data === 'start_lottery') {
      const l = db.lottery;
      if (!l || l.creatorId !== userId) return bot.answerCallbackQuery(query.id);
      if (l.participants.length < l.capacity) {
        return bot.answerCallbackQuery(query.id, {
          text: 'هنوز ظرفیت تکمیل نشده است.',
          show_alert: true,
        });
      }

      // چیدمان تصادفی برندگان (ترتیب تصادفی همان شرکت‌کنندگان)
      const winners = [...l.participants];
      for (let i = winners.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [winners[i], winners[j]] = [winners[j], winners[i]];
      }

      l.status = 'finished';
      db.lastResults = { winners };
      saveData();

      const resultText =
        'برندگان این قرعه‌کشی\n\n' +
        winners.map((w, i) => `${i + 1} ${w.name}`).join('\n');

      await bot.editMessageText(resultText, {
        chat_id: l.adminChatId,
        message_id: l.adminMsgId,
        reply_markup: { inline_keyboard: [[{ text: 'قرعه‌کشی جدید', callback_data: 'new_lottery' }]] },
      });
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'new_lottery') {
      if (!isAdmin(userId)) return bot.answerCallbackQuery(query.id);
      await bot.editMessageText(
        'خب خب خب\nبرای قرعه‌کشی چند نفر به غیر از خودت نیاز داری',
        { chat_id: chatId, message_id: msgId, reply_markup: capacityKeyboard() }
      );
      return bot.answerCallbackQuery(query.id);
    }

    return bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('خطا در پردازش callback:', err.message);
    try {
      await bot.answerCallbackQuery(query.id);
    } catch (e2) {}
  }
});

console.log('ربات اجرا شد...');
