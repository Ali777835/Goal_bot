// ==============================
// ربات قرعه‌کشی تلگرامی
// ==============================
// نصب: npm install telegraf sqlite3
// اجرا: node bot.js

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '8955378151:AAGxpTcLJ2yghxIw9yDo4dsbPmDcaSqHqHg';
const ADMIN_IDS = [8955378151, 8800727588];

const bot = new Telegraf(TOKEN);

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// ------------------------------
// دیتابیس (کاربرانی که استارت زدن)
// ------------------------------
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        started INTEGER DEFAULT 0
    )
`);

function markStarted(userId, callback) {
    db.run('INSERT OR IGNORE INTO users (user_id, started) VALUES (?, 1)', [userId], () => {
        db.run('UPDATE users SET started = 1 WHERE user_id = ?', [userId], callback || (() => {}));
    });
}

function hasStarted(userId, callback) {
    db.get('SELECT started FROM users WHERE user_id = ?', [userId], (_err, row) => {
        callback(!!(row && row.started));
    });
}

function getAllStartedUsers(callback) {
    db.all('SELECT user_id FROM users WHERE started = 1', [], (_err, rows) => {
        callback((rows || []).map((r) => r.user_id));
    });
}

// کش نام‌ها
const nameCache = {};
function rememberName(user) {
    if (user && user.id) nameCache[user.id] = user.first_name || 'کاربر';
}
function nameOf(userId) {
    return nameCache[userId] || `کاربر ${userId}`;
}

bot.use((ctx, next) => {
    if (ctx.from) rememberName(ctx.from);
    return next();
});

// ------------------------------
// وضعیت قرعه‌کشی جاری (حافظه)
// ------------------------------
let currentRaffle = null; // { id, creator, needed, participants:[], status, creatorChatId, creatorMsgId, broadcasts:{userId:{chatId,msgId}} }
let lastWinners = null; // آرایه‌ی اسامی برندگان دور قبل

function newRaffleId() {
    return `r_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

// ------------------------------
// متن‌ها
// ------------------------------
function userWelcomeText(name) {
    return `🌟 سلام ${name} 🌟\n\nبرای شرکت توی قرعه‌کشی منتظر باش تا ادمین قرعه‌کشی رو بسازه..... 🎁⏳`;
}

function adminWelcomeText(name) {
    return `😍 سلام عشق من ${name} عزیزم 😍\n\nکاربرات با نفس‌های حبس‌شده منتظرن تا قرعه‌کشی رو بسازی 🎉🎊\nپس دکمه‌ی زیر رو بزن:`;
}

function adminAlreadyRaffleText() {
    return '⚠️ یه قرعه‌کشی از قبل در حال برگزاریه، اول اونو تموم کن بعد یکی جدید بساز.';
}

function collectingText(raffle) {
    let lines = `واااای 😲🎉\nحالا منتظر باش تا کاربران توی قرعه‌کشی شرکت کنن...\n\nکاربرانی که شرکت کردن:\n`;
    for (let i = 0; i < raffle.needed; i++) {
        const uid = raffle.participants[i];
        lines += `${i + 1}. ${uid ? nameOf(uid) : '—'}\n`;
    }
    lines += `\n⏳ منتظر باش ${nameOf(raffle.creator)} عزیز.....`;
    return lines;
}

function readyText(raffle) {
    let lines = `واااای 🥳🎊\nحالا همه شرکت کردن!\n\nکاربرانی که شرکت کردن:\n`;
    for (let i = 0; i < raffle.needed; i++) {
        lines += `${i + 1}. ${nameOf(raffle.participants[i])}\n`;
    }
    lines += `\n🚀 حالا دکمه‌ی زیر رو بزن تا همه منتظرن ببینن کی خوش‌شانسه!`;
    return lines;
}

function broadcastJoinText() {
    return `🎉✨ مدیر عزیز قرعه‌کشی رو ساخت! ✨🎉\n\nبرای شرکت توی قرعه‌کشی، سریع دکمه‌ی زیر رو بزن، جاهای خالی محدودن! 👇🔥`;
}

function waitingResultText() {
    return '⏳ منتظر باش تا نتایج قرعه‌کشی رو مدیر اعلام کنه..... 🤞';
}

function winnersText(raffle, winners) {
    let lines = `🎊🏆 برندگان این قرعه‌کشی 🏆🎊\n\n`;
    winners.forEach((uid, idx) => {
        lines += `${idx + 1}. ${nameOf(uid)}\n`;
    });
    lines += `\n✨ برای ساخت قرعه‌کشی جدید دکمه‌ی زیر رو بزن ✨`;
    return lines;
}

// ------------------------------
// استارت
// ------------------------------
bot.start((ctx) => {
    if (ctx.chat.type !== 'private') return;

    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'رفیق';

    if (isAdmin(userId)) {
        markStarted(userId, () => {
            ctx.reply(adminWelcomeText(name), {
                reply_markup: { inline_keyboard: [[{ text: '🎟 ساخت قرعه‌کشی', callback_data: 'raffle_create' }]] }
            });
        });
        return;
    }

    hasStarted(userId, (already) => {
        if (already) return; // پیوی برای کاربر عادی بسته‌ست، دیگه جواب نمی‌ده
        markStarted(userId, () => {
            ctx.reply(userWelcomeText(name));
        });
    });
});

// ------------------------------
// ساخت قرعه‌کشی (فقط مدیرا)
// ------------------------------
bot.action('raffle_create', (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ فقط مدیرها می‌تونن قرعه‌کشی بسازن.', { show_alert: true });
    if (currentRaffle) return ctx.answerCbQuery(adminAlreadyRaffleText(), { show_alert: true });

    const raffleId = newRaffleId();
    currentRaffle = {
        id: raffleId,
        creator: userId,
        needed: null,
        participants: [],
        status: 'choosing_count',
        creatorChatId: ctx.chat.id,
        creatorMsgId: null,
        broadcasts: {}
    };

    const buttons = [1, 2, 3, 4, 5, 6].map((n) => ({ text: String(n), callback_data: `raffle_count_${raffleId}_${n}` }));

    ctx.editMessageText('خب خب خب 😄🎯\nبرای قرعه‌کشی به‌غیر از خودت چند نفر لازم داری؟\n(عدد کل شرکت‌کننده‌ها رو انتخاب کن، خودت هم جزوشونی)', {
        reply_markup: { inline_keyboard: [buttons] }
    }).then((msg) => {
        currentRaffle.creatorMsgId = ctx.callbackQuery.message.message_id;
    }).catch(() => {});
});

bot.action(/^raffle_count_([\w]+)_(\d)$/, async (ctx) => {
    const raffleId = ctx.match[1];
    const n = parseInt(ctx.match[2]);
    const userId = ctx.from.id;

    if (!currentRaffle || currentRaffle.id !== raffleId) return ctx.answerCbQuery('❌ این قرعه‌کشی دیگه فعال نیست.', { show_alert: true });
    if (currentRaffle.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده انتخاب می‌کنه.', { show_alert: true });
    if (currentRaffle.status !== 'choosing_count') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    currentRaffle.needed = n;
    currentRaffle.participants = [userId]; // خود سازنده خودکار جزو شرکت‌کننده‌هاست
    currentRaffle.status = 'collecting';

    await ctx.editMessageText(collectingText(currentRaffle)).catch(() => {});

    if (currentRaffle.participants.length >= currentRaffle.needed) {
        await finalizeReady(ctx);
        return;
    }

    // ارسال پیام همگانی به همه‌ی کاربرا و مدیرای دیگه
    await broadcastJoinInvite(ctx);
});

async function broadcastJoinInvite(ctx) {
    const raffle = currentRaffle;
    const allUsers = await new Promise((resolve) => getAllStartedUsers(resolve));
    const targets = allUsers.filter((uid) => uid !== raffle.creator);

    const buttons = [[{ text: '🙋‍♂️ شرکت می‌کنم', callback_data: `raffle_join_${raffle.id}` }]];
    if (lastWinners && lastWinners.length > 0) {
        buttons.push([{ text: '🏆 برندگان قبلی', callback_data: 'raffle_prev_winners' }]);
    }

    for (const uid of targets) {
        try {
            const msg = await ctx.telegram.sendMessage(uid, broadcastJoinText(), {
                reply_markup: { inline_keyboard: buttons }
            });
            raffle.broadcasts[uid] = { chatId: uid, msgId: msg.message_id };
        } catch (e) {
            // احتمالاً کاربر ربات رو بلاک کرده، رد می‌شیم
        }
    }
}

// ------------------------------
// پیوستن به قرعه‌کشی
// ------------------------------
bot.action(/^raffle_join_([\w]+)$/, async (ctx) => {
    const raffleId = ctx.match[1];
    const userId = ctx.from.id;

    if (!currentRaffle || currentRaffle.id !== raffleId || currentRaffle.status !== 'collecting') {
        return ctx.answerCbQuery('❌ این قرعه‌کشی دیگه فعال نیست.', { show_alert: true });
    }
    if (currentRaffle.participants.includes(userId)) {
        return ctx.answerCbQuery('❌ قبلاً شرکت کردی!', { show_alert: true });
    }
    if (currentRaffle.participants.length >= currentRaffle.needed) {
        return ctx.answerCbQuery('😅 دیر رسیدی، ظرفیت تکمیل شده!', { show_alert: true });
    }

    currentRaffle.participants.push(userId);

    await ctx.editMessageText(waitingResultText()).catch(() => {});

    // آپدیت پیام سازنده
    if (currentRaffle.participants.length >= currentRaffle.needed) {
        await finalizeReady(ctx);
    } else {
        await ctx.telegram.editMessageText(
            currentRaffle.creatorChatId, currentRaffle.creatorMsgId, undefined,
            collectingText(currentRaffle)
        ).catch(() => {});
    }
});

async function finalizeReady(ctx) {
    const raffle = currentRaffle;
    raffle.status = 'ready';
    await ctx.telegram.editMessageText(
        raffle.creatorChatId, raffle.creatorMsgId, undefined,
        readyText(raffle),
        { reply_markup: { inline_keyboard: [[{ text: '🚀 شروع قرعه‌کشی', callback_data: `raffle_start_${raffle.id}` }]] } }
    ).catch(() => {});
}

// ------------------------------
// شروع قرعه‌کشی و اعلام برندگان
// ------------------------------
bot.action(/^raffle_start_([\w]+)$/, async (ctx) => {
    const raffleId = ctx.match[1];
    const userId = ctx.from.id;

    if (!currentRaffle || currentRaffle.id !== raffleId) return ctx.answerCbQuery('❌ این قرعه‌کشی دیگه فعال نیست.', { show_alert: true });
    if (currentRaffle.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه شروعش کنه.', { show_alert: true });
    if (currentRaffle.status !== 'ready') return ctx.answerCbQuery('❌ هنوز همه شرکت نکردن.', { show_alert: true });

    const raffle = currentRaffle;
    const winners = [];
    for (let i = 0; i < raffle.needed; i++) {
        const w = raffle.participants[Math.floor(Math.random() * raffle.participants.length)];
        winners.push(w);
    }

    lastWinners = winners.map((uid) => nameOf(uid));

    await ctx.editMessageText(winnersText(raffle, winners), {
        reply_markup: { inline_keyboard: [[{ text: '🎟 قرعه‌کشی جدید', callback_data: 'raffle_create' }]] }
    }).catch(() => {});

    currentRaffle = null;
});

// ------------------------------
// نمایش برندگان دور قبل
// ------------------------------
bot.action('raffle_prev_winners', (ctx) => {
    if (!lastWinners || lastWinners.length === 0) {
        return ctx.answerCbQuery('هنوز قرعه‌کشی‌ای تموم نشده 😊', { show_alert: true });
    }
    let text = '🏆✨ برندگان دور قبل ✨🏆\n\n';
    lastWinners.forEach((name, idx) => {
        text += `${idx + 1}. ${name}\n`;
    });
    ctx.answerCbQuery();
    ctx.reply(text);
});

// ------------------------------
// اجرا
// ------------------------------
bot.launch();
console.log('ربات قرعه‌کشی با موفقیت اجرا شد ✅');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
