// ==============================
// ربات بازی تلگرامی - دوز + حکم
// ==============================
// نصب: npm install telegraf sqlite3
// اجرا: node bot.js

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '7980096496:AAEza-CUFjxG-e6u2Y-NJkgJUK4i73dg3iY';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7744236569');

const bot = new Telegraf(TOKEN);

// ------------------------------
// دیتابیس (فقط برای موجودی الماس - مورد استفاده در بازی دوز)
// ------------------------------
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        diamonds INTEGER DEFAULT 0
    )
`);

function getUser(userId, callback) {
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (_err, row) => {
        if (!row) {
            db.run('INSERT INTO users (user_id, diamonds) VALUES (?, 0)', [userId], () => {
                db.get('SELECT * FROM users WHERE user_id = ?', [userId], (_e, newRow) => callback(newRow));
            });
        } else {
            callback(row);
        }
    });
}

function updateUser(userId, data, callback) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.run(`UPDATE users SET ${setClause} WHERE user_id = ?`, [...values, userId], callback || (() => {}));
}

// یک کش ساده برای نگه‌داشتن نام کاربرا (برای نمایش به‌جای آیدی عددی)
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
// منوی اصلی (خصوصی)
// ------------------------------
function mainMenuKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💎 درخواست الماس', callback_data: 'request_diamonds' }],
                [{ text: '👤 حساب کاربری', callback_data: 'account' }],
                [{ text: '📩 پیشنهاد بازی', callback_data: 'suggest' }],
                [{ text: '🎮 بازی', callback_data: 'game' }]
            ]
        }
    };
}

function mainMenuText(name, diamonds) {
    return `✨ سلام ${name} عزیز! ✨\nبه دنیای بازی خوش اومدی 🎮\n\n💎 موجودی فعلیت: ${diamonds}\n\nیکی از گزینه‌های پایین رو انتخاب کن:`;
}

bot.start((ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'رفیق';
    const chatType = ctx.chat.type;

    if (chatType === 'group' || chatType === 'supergroup') {
        ctx.getChatMember(ctx.botInfo.id).then((botMember) => {
            if (botMember.status === 'administrator' || botMember.status === 'creator') {
                ctx.reply(
                    '🎉 سلاااام به بچه‌های گروه! 🎉\n' +
                    '🃏 برای بازی دوز بنویس: دوز 20\n' +
                    '🎴 برای بازی حکم ۴ نفره بنویس: حکم 4 نفر\n' +
                    '🎴 برای بازی حکم ۲ نفره بنویس: حکم 2 نفر\n\n' +
                    'خوش بگذره، موفق باشید! 🍀✨'
                );
            } else {
                ctx.reply('❌ لطفاً اول ربات رو ادمین گروه کنید تا فعال بشه.');
            }
        });
        return;
    }

    getUser(userId, (user) => {
        ctx.reply(mainMenuText(name, user.diamonds), mainMenuKeyboard());
    });
});

bot.action('back', (ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'رفیق';
    getUser(userId, (user) => {
        ctx.editMessageText(mainMenuText(name, user.diamonds), mainMenuKeyboard()).catch(() => {
            ctx.reply(mainMenuText(name, user.diamonds), mainMenuKeyboard());
        });
    });
});

// ------------------------------
// درخواست الماس رایگان
// ------------------------------
const requestTemp = {};

function numpadKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['✓', '0', '×']
            ].map((row) => row.map((v) => ({ text: v, callback_data: `req_num_${v}` })))
        }
    };
}

function numpadText(display) {
    return `💎 چند تا الماس می‌خوای درخواست بدی؟\nعدد مورد نظرت رو با دکمه‌های پایین وارد کن ✏️\n\n🔢 مقدار فعلی: ${display}`;
}

bot.action('request_diamonds', (ctx) => {
    requestTemp[ctx.from.id] = '';
    ctx.editMessageText(numpadText('0'), numpadKeyboard()).catch(() => {
        ctx.reply(numpadText('0'), numpadKeyboard());
    });
});

bot.action(/^req_num_(.+)$/, (ctx) => {
    const userId = ctx.from.id;
    const val = ctx.match[1];
    const current = requestTemp[userId] || '';

    if (val === '✓') {
        const amount = parseInt(current);
        if (!amount || amount <= 0) {
            return ctx.answerCbQuery('❌ اول یه عدد معتبر وارد کن!', { show_alert: true });
        }
        if (!ADMIN_ID) {
            return ctx.answerCbQuery('⚠️ ادمین هنوز تنظیم نشده.', { show_alert: true });
        }

        delete requestTemp[userId];
        const name = ctx.from.first_name || 'یه کاربر';

        ctx.editMessageText(`✅ درخواستت (💎 ${amount}) به مدیر ارسال شد.\n⏳ منتظر بمون تا لطف کنه و تاییدش کنه 🙏`).catch(() => {
            ctx.reply(`✅ درخواستت (💎 ${amount}) به مدیر ارسال شد.\n⏳ منتظر بمون تا لطف کنه و تاییدش کنه 🙏`);
        });

        ctx.telegram.sendMessage(
            ADMIN_ID,
            `📩 درخواست الماس جدید\n\n👤 نام: ${name}\n🆔 آیدی: ${userId}\n💎 مقدار درخواستی: ${amount}\n\nتاییدش می‌کنی؟ 🤔`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ میدم', callback_data: `req_accept_${userId}_${amount}` }],
                        [{ text: '❌ نمیدم', callback_data: `req_reject_${userId}` }]
                    ]
                }
            }
        );
        return;
    }

    if (val === '×') {
        requestTemp[userId] = current.slice(0, -1);
    } else {
        if (current.length >= 6) return;
        requestTemp[userId] = current + val;
    }

    const display = requestTemp[userId] || '0';
    ctx.editMessageText(numpadText(display), numpadKeyboard()).catch(() => {});
});

bot.action(/^req_accept_(\d+)_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const amount = parseInt(ctx.match[2]);

    getUser(userId, (user) => {
        updateUser(userId, { diamonds: user.diamonds + amount }, () => {
            ctx.editMessageText(`✅ تایید شد! 💎 ${amount} به کاربر ${userId} اضافه شد.`).catch(() => {});
            ctx.telegram.sendMessage(userId, `🎉🎁 مدیر لطف کرد و 💎 ${amount} بهت اضافه کرد! نوش جونت 😍`);
        });
    });
});

bot.action(/^req_reject_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.editMessageText('❌ رد شد.').catch(() => {});
    ctx.telegram.sendMessage(userId, '😅 مدیر این بار رد کرد، یه وقت دیگه امتحان کن رفیق!');
});

// ------------------------------
// حساب کاربری
// ------------------------------
bot.action('account', (ctx) => {
    const userId = ctx.from.id;
    getUser(userId, (user) => {
        ctx.editMessageText(
            `👤✨ حساب کاربری شما ✨\n\n🆔 آیدی: ${userId}\n💎 تعداد الماس: ${user.diamonds}`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'back' }]] } }
        ).catch(() => {});
    });
});

// ------------------------------
// پیشنهاد بازی
// ------------------------------
const awaitingSuggestion = new Set();

bot.action('suggest', (ctx) => {
    awaitingSuggestion.add(ctx.from.id);
    ctx.editMessageText('💡 بازی پیشنهادیت رو بنویس، با کمال میل می‌خونمش 😊').catch(() => {
        ctx.reply('💡 بازی پیشنهادیت رو بنویس، با کمال میل می‌خونمش 😊');
    });
});

// ------------------------------
// دکمه‌ی بازی (منو)
// ------------------------------
bot.action('game', (ctx) => {
    ctx.editMessageText(
        '🎮✨ بازی‌های فعلی ✨🎮\n\n🃏 دوز\n🎴 حکم\n\nبرای شروع بازی، منو به گروهت اضافه کن 👇',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ افزودن به گروه', url: `https://t.me/${ctx.botInfo.username}?startgroup=new` }],
                    [{ text: '🔙 برگشت', callback_data: 'back' }]
                ]
            }
        }
    ).catch(() => {});
});

// ------------------------------
// متن‌های آزاد (پیشنهاد بازی)
// ------------------------------
bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (ctx.chat.type === 'private' && awaitingSuggestion.has(userId)) {
        awaitingSuggestion.delete(userId);
        ctx.reply('👌 باشه، فرستادم پیش مدیر. نتیجه رو بهت می‌گم 😉');

        if (ADMIN_ID) {
            ctx.telegram.sendMessage(
                ADMIN_ID,
                `📩✨ پیشنهاد بازی جدید ✨\n\n👤 کاربر: ${userId}\n📝 متن: ${text}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ تایید', callback_data: `suggest_accept_${userId}` }],
                            [{ text: '❌ رد', callback_data: `suggest_reject_${userId}` }]
                        ]
                    }
                }
            );
        }
        return;
    }

    return next();
});

bot.action(/^suggest_accept_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.editMessageText('✅ تایید شد.').catch(() => {});
    ctx.telegram.sendMessage(userId, '🎉 پیشنهادت تایید شد، ایده‌ی خیلی خوبی بود! 👏');
});

bot.action(/^suggest_reject_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.editMessageText('❌ رد شد.').catch(() => {});
    ctx.telegram.sendMessage(userId, '😅 این بار پیشنهادت قبول نشد، یه بار دیگه امتحان کن رفیق!');
});

// ==============================
// بازی دوز (Tic-Tac-Toe) دو نفره با شرط الماس
// ==============================
const dozGames = {};
const DOZ_MIN_BET = 20;

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function cellSymbol(cell) {
    if (cell === 'red') return '🔴';
    if (cell === 'blue') return '🔵';
    return '•';
}

function boardKeyboard(gameId, board) {
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            row.push({ text: cellSymbol(board[idx]), callback_data: `doz_move_${gameId}_${idx}` });
        }
        rows.push(row);
    }
    return rows;
}

function dozWaitingText(amount) {
    return `⭕ یه دوز حسابی راه افتاد!\n\n💎 مقدار الماس: ${amount}\n🎁 مقدار جایزه: ${amount * 2}\n\nکی جرأت داره بیاد؟ دکمه‌ی پیوستن رو بزن!`;
}

function dozBoardText(game) {
    const turnSymbol = cellSymbol(game.turn);
    return (
        `⭕ شروع بازی دوز\n\n` +
        `کاربر 🔴\n${nameOf(game.colors.red)}\n\n` +
        `کاربر 🔵\n${nameOf(game.colors.blue)}\n\n` +
        `نوبت ${turnSymbol}`
    );
}

bot.hears(/^دوز (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی دوز فقط داخل گروه انجام می‌شه.');
    if (amount < DOZ_MIN_BET) return ctx.reply(`❌ حداقل شرط برای دوز ${DOZ_MIN_BET} الماسه.`);

    getUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        updateUser(userId, { diamonds: user.diamonds - amount }, () => {
            const gameId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            dozGames[gameId] = {
                creator: userId,
                amount,
                prize: amount * 2,
                status: 'waiting',
                board: Array(9).fill(null),
                colors: {},
                turn: null
            };

            ctx.reply(dozWaitingText(amount), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ لغو بازی', callback_data: `doz_cancel_${gameId}` }],
                        [{ text: '➕ پیوستن', callback_data: `doz_join_${gameId}` }]
                    ]
                }
            });
        });
    });
});

bot.action(/^doz_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = dozGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی شروع شده.', { show_alert: true });

    getUser(userId, (user) => {
        updateUser(userId, { diamonds: user.diamonds + game.amount }, () => {
            delete dozGames[gameId];
            ctx.editMessageText('❌ بازی دوز لغو شد.').catch(() => {});
        });
    });
});

bot.action(/^doz_join_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = dozGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی پر شده یا شروع شده.', { show_alert: true });
    if (game.creator === userId) return ctx.answerCbQuery('❌ نمی‌تونی به بازی خودت بپیوندی.', { show_alert: true });

    getUser(userId, (user) => {
        if (user.diamonds < game.amount) {
            return ctx.answerCbQuery(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`, { show_alert: true });
        }

        updateUser(userId, { diamonds: user.diamonds - game.amount }, () => {
            const players = [game.creator, userId];
            const firstIdx = Math.floor(Math.random() * 2);
            const redUser = players[firstIdx];
            const blueUser = players[1 - firstIdx];

            game.colors = { red: redUser, blue: blueUser };
            game.turn = 'red';
            game.status = 'playing';

            ctx.editMessageText(dozBoardText(game), {
                reply_markup: { inline_keyboard: boardKeyboard(gameId, game.board) }
            }).catch(() => {});
        });
    });
});

bot.action(/^doz_move_([\w]+)_(\d)$/, (ctx) => {
    const gameId = ctx.match[1];
    const idx = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const game = dozGames[gameId];

    if (!game || game.status !== 'playing') return ctx.answerCbQuery('❌ این بازی فعال نیست.', { show_alert: true });

    const currentColorUser = game.colors[game.turn];
    if (userId !== currentColorUser) return ctx.answerCbQuery('❌ نوبت تو نیست.', { show_alert: true });
    if (game.board[idx]) return ctx.answerCbQuery('❌ این خونه پره.', { show_alert: true });

    game.board[idx] = game.turn;

    const winnerColor = WIN_PATTERNS.find(
        (p) => game.board[p[0]] && game.board[p[0]] === game.board[p[1]] && game.board[p[1]] === game.board[p[2]]
    );

    if (winnerColor) {
        const winnerUser = game.colors[game.board[winnerColor[0]]];
        const loserColor = game.board[winnerColor[0]] === 'red' ? 'blue' : 'red';
        const loserUser = game.colors[loserColor];

        game.status = 'finished';

        getUser(winnerUser, (winner) => {
            const winnerNew = winner.diamonds + game.prize;
            updateUser(winnerUser, { diamonds: winnerNew }, () => {
                getUser(loserUser, (loser) => {
                    ctx.editMessageText(
                        `🎉 وای وای وای! بازی تموم شد!\n\n🥇 قهرمان میدون\n${nameOf(winnerUser)}\n\n😅 بازنده‌ی بدشانس\n${nameOf(loserUser)}`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: `🎁 مقدار جایزه: ${game.prize}`, callback_data: 'dummy' }],
                                    [{ text: `💰 موجودی برنده: ${winnerNew}`, callback_data: 'dummy' }],
                                    [{ text: `💰 موجودی بازنده: ${loser.diamonds}`, callback_data: 'dummy' }]
                                ]
                            }
                        }
                    ).catch(() => {});
                    delete dozGames[gameId];
                });
            });
        });
        return;
    }

    const isFull = game.board.every((c) => c !== null);
    if (isFull) game.board = Array(9).fill(null);

    game.turn = game.turn === 'red' ? 'blue' : 'red';

    ctx.editMessageText(dozBoardText(game), {
        reply_markup: { inline_keyboard: boardKeyboard(gameId, game.board) }
    }).catch(() => {});
});

// ==============================
// بازی حکم (۴ نفره)
// ==============================
const hokmGames = {}; // gameId -> game state
const HOKM_SUITS = ['♠️', '♣️', '♦️', '♥️'];
const HOKM_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_VALUE = {}; // بالاتر = مقدار بیشتر
HOKM_RANKS.forEach((r, i) => { RANK_VALUE[r] = HOKM_RANKS.length - i; });

// ترتیب چرخشی نوبت بر اساس موقعیت
const POSITION_ORDER = ['bottom', 'left', 'top', 'right'];

function buildDeck() {
    const deck = [];
    for (const suit of HOKM_SUITS) {
        for (const rank of HOKM_RANKS) {
            deck.push({ rank, suit, code: `${rank}${suit}` });
        }
    }
    return deck;
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function nextPosition(pos) {
    const idx = POSITION_ORDER.indexOf(pos);
    return POSITION_ORDER[(idx + 1) % 4];
}

function userAtPosition(game, pos) {
    return Object.keys(game.positions).find((uid) => game.positions[uid] === pos);
}

function positionOf(game, userId) {
    return game.positions[userId];
}

function teamOfPosition(pos) {
    return (pos === 'top' || pos === 'bottom') ? 'A' : 'B';
}

function teamOfUser(game, userId) {
    return teamOfPosition(positionOf(game, userId));
}

// ------------------------------
// شروع بازی حکم - دستور گروهی
// ------------------------------
bot.hears(/^حکم(?:\s*4\s*نفر)?$/, (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی حکم فقط داخل گروه انجام می‌شه.');

    const userId = ctx.from.id;
    const gameId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    hokmGames[gameId] = {
        chatId: ctx.chat.id,
        messageId: null,
        creator: userId,
        participants: [userId],
        status: 'joining',
        totalSets: null,
        captains: [],
        teams: {},
        positions: {},
        setsWon: { A: 0, B: 0 },
        setNum: 1,
        trickNum: 1,
        dealer: null,
        trumpSuit: null,
        hands: {},
        trick: [],
        leadSuit: null,
        turn: null,
        privateMsgIds: {} // userId -> { statusMsgId, cardsMsgId }
    };

    sendJoinMessage(ctx, gameId);
});

function participantsListText(game) {
    return game.participants.map((id) => nameOf(id)).join('\n');
}

async function sendJoinMessage(ctx, gameId) {
    const game = hokmGames[gameId];
    const text = `حکم 4 نفره\n\nشرکت‌کنندگان:\n${participantsListText(game)}\n\nبرای بازی کردن دکمه پیوستن رو بزن`;
    const msg = await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '❌ لغو بازی', callback_data: `hokm_cancel_${gameId}` }],
                [{ text: '➕ پیوستن', callback_data: `hokm_join_${gameId}` }]
            ]
        }
    });
    game.messageId = msg.message_id;
}

bot.action(/^hokm_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== ctx.from.id) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });
    if (game.status !== 'joining') return ctx.answerCbQuery('❌ بازی شروع شده.', { show_alert: true });

    delete hokmGames[gameId];
    ctx.editMessageText('❌ بازی حکم لغو شد.').catch(() => {});
});

bot.action(/^hokm_join_([\w]+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const game = hokmGames[gameId];
    const userId = ctx.from.id;

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'joining') return ctx.answerCbQuery('❌ بازی پر شده یا شروع شده.', { show_alert: true });
    if (game.participants.includes(userId)) return ctx.answerCbQuery('❌ قبلاً پیوستی.', { show_alert: true });

    game.participants.push(userId);

    if (game.participants.length < 4) {
        const text = `حکم 4 نفره\n\nشرکت‌کنندگان:\n${participantsListText(game)}\n\nبرای بازی کردن دکمه پیوستن رو بزن`;
        ctx.editMessageText(text, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ لغو بازی', callback_data: `hokm_cancel_${gameId}` }],
                    [{ text: '➕ پیوستن', callback_data: `hokm_join_${gameId}` }]
                ]
            }
        }).catch(() => {});
        return;
    }

    // ۴ نفر تکمیل شد → سوال تعداد ست‌ها
    game.status = 'choosing_rounds';
    askRoundsCount(ctx, gameId);
});

function askRoundsCount(ctx, gameId) {
    const buttons = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ text: String(n), callback_data: `hokm_rounds_${gameId}_${n}` }));
    ctx.editMessageText('چند دست (ست) بازی کنیم؟', { reply_markup: { inline_keyboard: [buttons] } }).catch(() => {});
}

bot.action(/^hokm_rounds_([\w]+)_(\d)$/, (ctx) => {
    const gameId = ctx.match[1];
    const n = parseInt(ctx.match[2]);
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== ctx.from.id) return ctx.answerCbQuery('❌ فقط سازنده انتخاب می‌کنه.', { show_alert: true });
    if (game.status !== 'choosing_rounds') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    game.totalSets = n;
    game.status = 'choosing_captains';
    askCaptains(ctx, gameId);
});

function askCaptains(ctx, gameId) {
    const game = hokmGames[gameId];
    const buttons = game.participants.map((id) => ({ text: nameOf(id), callback_data: `hokm_cap_${gameId}_${id}` }));
    ctx.editMessageText('چه کسانی سرگروه باشن؟ (۲ نفر رو انتخاب کن)', {
        reply_markup: { inline_keyboard: [buttons] }
    }).catch(() => {});
}

bot.action(/^hokm_cap_([\w]+)_(\d+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const capId = parseInt(ctx.match[2]);
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== ctx.from.id) return ctx.answerCbQuery('❌ فقط سازنده انتخاب می‌کنه.', { show_alert: true });
    if (game.status !== 'choosing_captains') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });
    if (game.captains.includes(capId)) return ctx.answerCbQuery('❌ قبلاً انتخاب شده.', { show_alert: true });

    game.captains.push(capId);

    if (game.captains.length < 2) {
        const remaining = game.participants.filter((id) => !game.captains.includes(id));
        const buttons = remaining.map((id) => ({ text: nameOf(id), callback_data: `hokm_cap_${gameId}_${id}` }));
        ctx.editMessageText(`چه کسانی سرگروه باشن؟ (سرگروه اول: ${nameOf(game.captains[0])} — یک نفر دیگه رو انتخاب کن)`, {
            reply_markup: { inline_keyboard: [buttons] }
        }).catch(() => {});
        return;
    }

    // ۲ سرگروه مشخص شد → انتخاب هم‌تیمی، به‌نوبت
    game.status = 'choosing_teammates';
    game.remainingForTeams = game.participants.filter((id) => !game.captains.includes(id));
    game.teams = { [game.captains[0]]: [game.captains[0]], [game.captains[1]]: [game.captains[1]] };
    game.pickTurnIdx = 0; // 0 => captains[0] پیک می‌کنه، بعد captains[1]

    askTeammatePick(ctx, gameId);
});

function teamsStatusText(game) {
    const cap1 = game.captains[0];
    const cap2 = game.captains[1];
    const team1Mates = game.teams[cap1].filter((id) => id !== cap1).map((id) => nameOf(id)).join('، ') || '';
    const team2Mates = game.teams[cap2].filter((id) => id !== cap2).map((id) => nameOf(id)).join('، ') || '';
    return `سرگروه یکی انتخاب کن\n\nتیم ${nameOf(cap1)}\n${team1Mates}\n\nتیم ${nameOf(cap2)}\n${team2Mates}`;
}

function askTeammatePick(ctx, gameId) {
    const game = hokmGames[gameId];
    const currentCaptain = game.captains[game.pickTurnIdx];
    const remaining = game.remainingForTeams;

    if (remaining.length === 1) {
        // آخرین نفر خودکار به تیم سرگروه دوم می‌ره
        const lastId = remaining[0];
        const lastCaptain = game.captains[1 - game.pickTurnIdx === 0 ? 0 : 1]; // در واقع سرگروهی که هنوز پیک نکرده
        finalizeTeams(ctx, gameId);
        return;
    }

    const buttons = remaining.map((id) => ({ text: nameOf(id), callback_data: `hokm_pick_${gameId}_${id}` }));
    const text = `${teamsStatusText(game)}\n\n${nameOf(currentCaptain)} انتخاب کن کدوم 🤔`;
    ctx.editMessageText(text, { reply_markup: { inline_keyboard: [buttons] } }).catch(() => {});
}

bot.action(/^hokm_pick_([\w]+)_(\d+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const pickedId = parseInt(ctx.match[2]);
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });

    const currentCaptain = game.captains[game.pickTurnIdx];
    if (ctx.from.id !== currentCaptain) return ctx.answerCbQuery('❌ نوبت تو نیست.', { show_alert: true });
    if (game.status !== 'choosing_teammates') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    game.teams[currentCaptain].push(pickedId);
    game.remainingForTeams = game.remainingForTeams.filter((id) => id !== pickedId);

    if (game.remainingForTeams.length === 1) {
        // نفر آخر خودکار می‌ره به تیم سرگروهی که هنوز یه نفره
        const otherCaptain = game.captains.find((c) => c !== currentCaptain);
        const lastId = game.remainingForTeams[0];
        game.teams[otherCaptain].push(lastId);
        game.remainingForTeams = [];
        finalizeTeams(ctx, gameId);
        return;
    }

    game.pickTurnIdx = 1 - game.pickTurnIdx;
    askTeammatePick(ctx, gameId);
});

function finalizeTeams(ctx, gameId) {
    const game = hokmGames[gameId];
    const cap1 = game.captains[0]; // -> left, teammate -> right
    const cap2 = game.captains[1]; // -> top, teammate -> bottom

    const cap1Mate = game.teams[cap1].find((id) => id !== cap1);
    const cap2Mate = game.teams[cap2].find((id) => id !== cap2);

    game.positions = {};
    game.positions[cap1] = 'left';
    game.positions[cap1Mate] = 'right';
    game.positions[cap2] = 'top';
    game.positions[cap2Mate] = 'bottom';

    game.status = 'ready';

    const text = `${teamsStatusText(game)}\n\nبرای شروع بازی لمس کن سریع دکمه پایینو`;
    ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: [[{ text: 'شروع کنیم✅', callback_data: `hokm_start_${gameId}` }]] }
    }).catch(() => {});
}

// ------------------------------
// چیدمان و متن وضعیت بازی
// ------------------------------
function seatLine(game, pos) {
    const uid = userAtPosition(game, pos);
    if (!uid) return '';
    let label = nameOf(uid);
    if (pos === 'left' || pos === 'bottom') {
        const team = teamOfPosition(pos);
        label += `(${game.tricksThisSet ? game.tricksThisSet[team] : 0})`;
    }
    if (game.dealer === uid) label += '👑';
    return label;
}

function boardLayoutText(game) {
    const top = seatLine(game, 'top');
    const left = seatLine(game, 'left');
    const right = seatLine(game, 'right');
    const bottom = seatLine(game, 'bottom');

    return (
        `                ${top}\n\n` +
        `${left}                                    ${right}\n\n` +
        `                ${bottom}`
    );
}

function capName(game, teamIdx) {
    return nameOf(game.captains[teamIdx]);
}

function gameStatusText(game, extra) {
    const cap1 = game.captains[0];
    const cap2 = game.captains[1];
    const setsA = game.setsWon['A']; // top+bottom
    const setsB = game.setsWon['B']; // left+right
    // نگاشت "تیم {نام سرگروه}" برای هر تیم
    const teamLabel = (capId) => `تیم ${nameOf(capId)}`;
    const cap1Team = teamOfUser(game, cap1); // معمولاً B (چپ)
    const cap2Team = teamOfUser(game, cap2); // معمولاً A (بالا)

    let header = `شروع دست ${game.trickNum}|ست ${game.setNum}\n`;
    header += `${teamLabel(cap2)}:${game.setsWon[cap2Team]}\n`;
    header += `${teamLabel(cap1)}:${game.setsWon[cap1Team]}\n`;
    header += `حکم${game.trumpSuit || ''}\n\n`;

    let text = header + boardLayoutText(game);

    if (extra) {
        text += `\n\n${extra}`;
    } else if (game.turn) {
        text += `\n\nنوبت ${nameOf(game.turn)}`;
    }

    return text;
}

// ------------------------------
// شروع بازی
// ------------------------------
bot.action(/^hokm_start_([\w]+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'ready') return ctx.answerCbQuery('❌ نمی‌شه الان شروع کرد.', { show_alert: true });

    game.status = 'starting';
    game.tricksThisSet = { A: 0, B: 0 };

    const text = '🎴 میز حکم پهن شد! همه آماده باشن...\n\n' + boardLayoutText(game) + '\n\n👑 حاکم امشب مشخص شد......';
    await ctx.editMessageText(text).catch(() => {});

    setTimeout(() => startNewSet(ctx, gameId, true), 2000);
});

function startNewSet(ctx, gameId, isFirstSet) {
    const game = hokmGames[gameId];
    if (!game) return;

    game.trickNum = 1;
    game.tricksThisSet = { A: 0, B: 0 };
    game.trumpSuit = null;
    game.hands = {};
    game.trick = [];
    game.leadSuit = null;

    if (isFirstSet) {
        // انتخاب تصادفی حاکم اول
        const allUserIds = Object.keys(game.positions).map(Number);
        game.dealer = allUserIds[Math.floor(Math.random() * allUserIds.length)];
    }
    // اگه اولین ست نیست، game.dealer از قبل توسط تابع پایان ست تعیین شده

    game.turn = game.dealer;
    game.status = 'choosing_trump';

    const text = boardLayoutText(game) + `\n\nحکم انتخاب کن ${nameOf(game.dealer)}`;
    const buttons = HOKM_SUITS.map((s) => ({ text: s, callback_data: `hokm_trump_${gameId}_${s}` }));

    ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, text, {
        reply_markup: { inline_keyboard: [buttons] }
    }).catch(() => {});
}

bot.action(/^hokm_trump_([\w]+)_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const suit = ctx.match[2];
    const game = hokmGames[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (ctx.from.id !== game.dealer) return ctx.answerCbQuery('❌ فقط حاکم خال حکم رو انتخاب می‌کنه.', { show_alert: true });
    if (game.status !== 'choosing_trump') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    game.trumpSuit = suit;
    game.status = 'dealing';

    const text = `🔥 ${nameOf(game.dealer)} خال ${suit} رو به‌عنوان حکم انتخاب کرد! میز داغ شد 🔥\n\n${boardLayoutText(game)}\n\n🃏 در حال پخش کردن کارت‌ها......`;
    await ctx.editMessageText(text).catch(() => {});

    dealAndStartTricks(ctx, gameId);
});

async function dealAndStartTricks(ctx, gameId) {
    const game = hokmGames[gameId];
    const deck = shuffle(buildDeck());
    const userIds = Object.keys(game.positions).map(Number);

    userIds.forEach((uid, i) => {
        game.hands[uid] = deck.slice(i * 13, i * 13 + 13);
    });

    game.status = 'playing';
    game.turn = game.dealer;
    game.trick = [];
    game.leadSuit = null;

    // ارسال پیام کارت‌ها + وضعیت به پیوی هر بازیکن
    for (const uid of userIds) {
        await sendPrivateHand(ctx, gameId, uid).catch(() => {});
        await sendOrUpdatePrivateStatus(ctx, gameId, uid, true).catch(() => {});
    }

    updateGroupStatus(ctx, gameId);
}

function cardButtonsRow(gameId, hand) {
    return hand.map((c) => ({ text: c.code, callback_data: `hokm_play_${gameId}_${c.code}` }));
}

async function sendPrivateHand(ctx, gameId, userId) {
    const game = hokmGames[gameId];
    const hand = game.hands[userId];
    const msg = await ctx.telegram.sendMessage(userId, 'کارت های شما:', {
        reply_markup: { inline_keyboard: [cardButtonsRow(gameId, hand)] }
    });
    if (!game.privateMsgIds[userId]) game.privateMsgIds[userId] = {};
    game.privateMsgIds[userId].cardsMsgId = msg.message_id;
}

async function updatePrivateHand(ctx, gameId, userId) {
    const game = hokmGames[gameId];
    const hand = game.hands[userId];
    const ids = game.privateMsgIds[userId];
    if (!ids || !ids.cardsMsgId) return;
    await ctx.telegram.editMessageReplyMarkup(userId, ids.cardsMsgId, undefined, {
        inline_keyboard: [cardButtonsRow(gameId, hand)]
    }).catch(() => {});
}

async function sendOrUpdatePrivateStatus(ctx, gameId, userId, createNew) {
    const game = hokmGames[gameId];
    const text = gameStatusText(game);
    if (createNew) {
        const msg = await ctx.telegram.sendMessage(userId, text);
        if (!game.privateMsgIds[userId]) game.privateMsgIds[userId] = {};
        game.privateMsgIds[userId].statusMsgId = msg.message_id;
    } else {
        const ids = game.privateMsgIds[userId];
        if (!ids || !ids.statusMsgId) return;
        await ctx.telegram.editMessageText(userId, ids.statusMsgId, undefined, text).catch(() => {});
    }
}

async function updateGroupStatus(ctx, gameId, extraText) {
    const game = hokmGames[gameId];
    const text = gameStatusText(game, extraText);
    await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, text).catch(() => {});
}

async function updateAllStatuses(ctx, gameId, extraText) {
    const game = hokmGames[gameId];
    await updateGroupStatus(ctx, gameId, extraText);
    for (const uid of Object.keys(game.positions).map(Number)) {
        await sendOrUpdatePrivateStatus(ctx, gameId, uid, false).catch(() => {});
    }
}

// ------------------------------
// انداختن کارت
// ------------------------------
bot.action(/^hokm_play_([\w]+)_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const cardCode = ctx.match[2];
    const userId = ctx.from.id;
    const game = hokmGames[gameId];

    if (!game || game.status !== 'playing') return ctx.answerCbQuery('❌ این بازی فعال نیست.', { show_alert: true });
    if (game.turn !== userId) return ctx.answerCbQuery('❌ نوبت تو نیست.', { show_alert: true });

    const hand = game.hands[userId];
    const cardIdx = hand.findIndex((c) => c.code === cardCode);
    if (cardIdx === -1) return ctx.answerCbQuery('❌ این کارت رو نداری.', { show_alert: true });

    const card = hand[cardIdx];

    // بررسی الزام پیروی از خال شروع‌کننده
    if (game.trick.length > 0) {
        const leadSuit = game.leadSuit;
        const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
        if (hasLeadSuit && card.suit !== leadSuit) {
            return ctx.answerCbQuery(`❌ باید از خال ${leadSuit} بندازی.`, { show_alert: true });
        }
    }

    // حذف کارت از دست بازیکن
    hand.splice(cardIdx, 1);
    game.trick.push({ userId, card });
    if (game.trick.length === 1) game.leadSuit = card.suit;

    await ctx.answerCbQuery();
    await updatePrivateHand(ctx, gameId, userId);

    if (game.trick.length < 4) {
        const currentPos = positionOf(game, userId);
        const nextPos = nextPosition(currentPos);
        game.turn = userAtPosition(game, nextPos);
        await updateAllStatuses(ctx, gameId);
        return;
    }

    // دست کامل شد → تعیین برنده
    resolveTrick(ctx, gameId);
});

async function resolveTrick(ctx, gameId) {
    const game = hokmGames[gameId];
    const leadSuit = game.leadSuit;
    const trumpSuit = game.trumpSuit;

    const trumpPlays = game.trick.filter((p) => p.card.suit === trumpSuit);
    let winnerPlay;
    if (trumpPlays.length > 0) {
        winnerPlay = trumpPlays.reduce((best, p) => (RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank] ? p : best));
    } else {
        const leadPlays = game.trick.filter((p) => p.card.suit === leadSuit);
        winnerPlay = leadPlays.reduce((best, p) => (RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank] ? p : best));
    }

    const winnerUserId = winnerPlay.userId;
    const winnerTeam = teamOfUser(game, winnerUserId);
    game.tricksThisSet[winnerTeam] += 1;

    game.trick = [];
    game.leadSuit = null;

    if (game.tricksThisSet[winnerTeam] >= 7) {
        // ست تموم شد
        await finishSet(ctx, gameId, winnerTeam, winnerUserId);
        return;
    }

    game.trickNum += 1;
    game.turn = winnerUserId;
    await updateAllStatuses(ctx, gameId);
}

async function finishSet(ctx, gameId, winnerTeam, lastTrickWinnerUserId) {
    const game = hokmGames[gameId];
    game.setsWon[winnerTeam] += 1;

    const winningCaptain = game.captains.find((c) => teamOfUser(game, c) === winnerTeam);
    const announceText = `🏆 چه دست پرقدرتی! این ست رو تیم ${nameOf(winningCaptain)} قاپید!`;
    await updateGroupStatus(ctx, gameId, announceText);
    for (const uid of Object.keys(game.positions).map(Number)) {
        await ctx.telegram.editMessageText(
            uid, game.privateMsgIds[uid].statusMsgId, undefined,
            `${gameStatusText(game)}\n\n${announceText}`
        ).catch(() => {});
    }

    if (game.setsWon[winnerTeam] >= game.totalSets) {
        setTimeout(() => finishGame(ctx, gameId, winnerTeam), 2000);
        return;
    }

    // تعیین حاکم ست بعدی: اگه تیم حاکم فعلی برد، همون می‌مونه؛ وگرنه نفر بعدی توی چرخش
    const dealerTeam = teamOfUser(game, game.dealer);
    if (dealerTeam !== winnerTeam) {
        const dealerPos = positionOf(game, game.dealer);
        const nextPos = nextPosition(dealerPos);
        game.dealer = userAtPosition(game, nextPos);
    }

    game.setNum += 1;

    setTimeout(async () => {
        game.trickNum = 1;
        game.tricksThisSet = { A: 0, B: 0 };
        game.trumpSuit = null;
        const text = boardLayoutText(game) + '\n\n👑 تعیین حاکم......';
        await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined,
            `شروع دست 1|ست ${game.setNum}\n${text}`
        ).catch(() => {});

        setTimeout(() => startNewSet(ctx, gameId, false), 1500);
    }, 2000);
}

async function finishGame(ctx, gameId, winnerTeam) {
    const game = hokmGames[gameId];
    const winningCaptain = game.captains.find((c) => teamOfUser(game, c) === winnerTeam);
    const losingCaptain = game.captains.find((c) => c !== winningCaptain);

    const finalText =
        `🎉🎉 واااای چه بازی‌ای بود! 🎉🎉\n\n` +
        `👑 تیم برنده\n${nameOf(winningCaptain)}\n\n` +
        `😔 تیم بازنده\n${nameOf(losingCaptain)}\n\n` +
        `ممنون که تا آخرش موندین، دمتون گرم! 🙌`;

    await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, finalText).catch(() => {});
    for (const uid of Object.keys(game.positions).map(Number)) {
        await ctx.telegram.editMessageText(uid, game.privateMsgIds[uid].statusMsgId, undefined, finalText).catch(() => {});
    }

    delete hokmGames[gameId];
}

// ------------------------------
// موجودی سریع + انتقال الماس
// ------------------------------
bot.hears('موجودی من', (ctx) => {
    getUser(ctx.from.id, (user) => {
        ctx.reply(`💎✨ موجودی شما: ${user.diamonds} ✨💎`);
    });
});

bot.hears(/^انتقال (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);
    const reply = ctx.message.reply_to_message;

    if (!reply) return ctx.reply('❌ باید روی پیام کاربر گیرنده ریپلای کنی.');
    const targetUserId = reply.from.id;
    if (targetUserId === userId) return ctx.reply('❌ نمی‌تونی به خودت انتقال بدی.');
    if (amount <= 0) return ctx.reply('❌ مقدار نامعتبره.');

    getUser(userId, (sender) => {
        if (sender.diamonds < amount) return ctx.reply(`❌ خودت الماس کافی نداری. موجودی: ${sender.diamonds}`);

        updateUser(userId, { diamonds: sender.diamonds - amount }, () => {
            getUser(targetUserId, (receiver) => {
                const receiverNew = receiver.diamonds + amount;
                updateUser(targetUserId, { diamonds: receiverNew }, () => {
                    ctx.reply(
                        `🔄✨ انتقال الماس ✨\n\n💎 مقدار: ${amount}\n👤 فرستنده: ${nameOf(userId)}\n👤 گیرنده: ${nameOf(targetUserId)}`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: `💰 موجودی فرستنده: ${sender.diamonds - amount}`, callback_data: 'dummy' }],
                                    [{ text: `💰 موجودی گیرنده: ${receiverNew}`, callback_data: 'dummy' }]
                                ]
                            }
                        }
                    );
                });
            });
        });
    });
});

// ==============================
// بازی حکم (۲ نفره)
// ==============================
const hokm2Games = {};

bot.hears(/^حکم\s*2\s*نفر$/, (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی حکم فقط داخل گروه انجام می‌شه.');

    const userId = ctx.from.id;
    const gameId = `h2_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    hokm2Games[gameId] = {
        chatId: ctx.chat.id,
        messageId: null,
        creator: userId,
        participants: [userId],
        status: 'joining',
        totalSets: null,
        positions: {},
        setsWon: {},
        setNum: 1,
        trickNum: 1,
        dealer: null,
        other: null,
        trumpSuit: null,
        hands: {},
        deck: [],
        discarded: {},
        offerQueue: [],
        offerIdx: 0,
        dealtCount: {},
        trick: [],
        leadSuit: null,
        turn: null,
        privateMsgIds: {}
    };

    sendH2JoinMessage(ctx, gameId);
});

async function sendH2JoinMessage(ctx, gameId) {
    const game = hokm2Games[gameId];
    const text = `🎴 حکم 2 نفره\n\nشرکت‌کنندگان:\n${game.participants.map((id) => nameOf(id)).join('\n')}\n\nبرای بازی کردن دکمه پیوستن رو بزن`;
    const msg = await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '❌ لغو بازی', callback_data: `h2_cancel_${gameId}` }],
                [{ text: '➕ پیوستن', callback_data: `h2_join_${gameId}` }]
            ]
        }
    });
    game.messageId = msg.message_id;
}

bot.action(/^h2_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const game = hokm2Games[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== ctx.from.id) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });
    if (game.status !== 'joining') return ctx.answerCbQuery('❌ بازی شروع شده.', { show_alert: true });

    delete hokm2Games[gameId];
    ctx.editMessageText('❌ بازی حکم لغو شد.').catch(() => {});
});

bot.action(/^h2_join_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const game = hokm2Games[gameId];
    const userId = ctx.from.id;

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'joining') return ctx.answerCbQuery('❌ بازی پر شده یا شروع شده.', { show_alert: true });
    if (game.participants.includes(userId)) return ctx.answerCbQuery('❌ قبلاً پیوستی.', { show_alert: true });

    game.participants.push(userId);
    game.status = 'choosing_rounds';

    const buttons = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ text: String(n), callback_data: `h2_rounds_${gameId}_${n}` }));
    ctx.editMessageText('چند دست (ست) بازی کنیم؟', { reply_markup: { inline_keyboard: [buttons] } }).catch(() => {});
});

bot.action(/^h2_rounds_([\w]+)_(\d)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const n = parseInt(ctx.match[2]);
    const game = hokm2Games[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== ctx.from.id) return ctx.answerCbQuery('❌ فقط سازنده انتخاب می‌کنه.', { show_alert: true });
    if (game.status !== 'choosing_rounds') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    game.totalSets = n;
    game.positions.top = game.participants[0];
    game.positions.bottom = game.participants[1];
    game.setsWon[game.participants[0]] = 0;
    game.setsWon[game.participants[1]] = 0;

    game.status = 'starting';
    const text = '🎴 میز حکم پهن شد! همه آماده باشن...\n\n' + h2LayoutText(game) + '\n\n👑 حاکم امشب مشخص شد......';
    await ctx.editMessageText(text).catch(() => {});

    setTimeout(() => startNewSetH2(ctx, gameId, true), 2000);
});

function h2LayoutText(game) {
    const top = game.positions.top;
    const bottom = game.positions.bottom;
    const topLabel = `${nameOf(top)}${game.dealer === top ? '👑' : ''}(${game.tricksThisSet ? game.tricksThisSet[top] : 0})`;
    const bottomLabel = `${nameOf(bottom)}${game.dealer === bottom ? '👑' : ''}(${game.tricksThisSet ? game.tricksThisSet[bottom] : 0})`;
    return `                ${topLabel}\n\n                ${bottomLabel}`;
}

function h2StatusText(game, extra) {
    const top = game.positions.top;
    const bottom = game.positions.bottom;
    let header = `شروع دست ${game.trickNum}|ست ${game.setNum}\n`;
    header += `${nameOf(top)}:${game.setsWon[top]}\n`;
    header += `${nameOf(bottom)}:${game.setsWon[bottom]}\n`;
    header += `حکم${game.trumpSuit || ''}\n\n`;

    let text = header + h2LayoutText(game);
    if (extra) {
        text += `\n\n${extra}`;
    } else if (game.turn) {
        text += `\n\nنوبت ${nameOf(game.turn)}`;
    }
    return text;
}

function startNewSetH2(ctx, gameId, isFirstSet) {
    const game = hokm2Games[gameId];
    if (!game) return;

    game.trickNum = 1;
    game.tricksThisSet = { [game.positions.top]: 0, [game.positions.bottom]: 0 };
    game.trumpSuit = null;
    game.hands = {};
    game.discarded = {};
    game.offerQueue = [];
    game.offerIdx = 0;
    game.dealtCount = {};
    game.trick = [];
    game.leadSuit = null;

    if (isFirstSet) {
        game.dealer = game.participants[Math.floor(Math.random() * 2)];
    }
    game.other = game.participants.find((id) => id !== game.dealer);

    const deck = shuffle(buildDeck());
    game.hands[game.dealer] = deck.splice(0, 5);
    game.hands[game.other] = deck.splice(0, 5);
    game.deck = deck; // ۴۲ کارت باقی‌مونده برای مراحل بعدی

    game.status = 'choosing_trump';

    const text = h2StatusText(game) .replace('نوبت', '') + `\n\nحکم انتخاب کن ${nameOf(game.dealer)}`;
    const buttons = HOKM_SUITS.map((s) => ({ text: s, callback_data: `h2_trump_${gameId}_${s}` }));
    ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, h2StatusText(game) + `\n\nحکم انتخاب کن ${nameOf(game.dealer)}`, {
        reply_markup: { inline_keyboard: [buttons] }
    }).catch(() => {});
}

bot.action(/^h2_trump_([\w]+)_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const suit = ctx.match[2];
    const game = hokm2Games[gameId];
    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (ctx.from.id !== game.dealer) return ctx.answerCbQuery('❌ فقط حاکم خال حکم رو انتخاب می‌کنه.', { show_alert: true });
    if (game.status !== 'choosing_trump') return ctx.answerCbQuery('❌ این مرحله تموم شده.', { show_alert: true });

    game.trumpSuit = suit;
    game.status = 'discarding';
    game.discarded[game.dealer] = 0;
    game.discarded[game.other] = 0;

    await ctx.editMessageText(`🔥 ${nameOf(game.dealer)} خال ${suit} رو به‌عنوان حکم انتخاب کرد!\n\n${h2LayoutText(game)}\n\nهر دو نفر باید ۲ کارت از ۵ کارت اولیه‌شون رو حذف کنن (توی پیوی)`).catch(() => {});

    for (const uid of [game.dealer, game.other]) {
        const msg = await ctx.telegram.sendMessage(uid, `خال حکم: ${suit}\nکدوم‌ها رو حذف می‌کنی؟ (۲ تا انتخاب کن)`, {
            reply_markup: { inline_keyboard: [cardButtonsRowDiscardH2(gameId, game.hands[uid])] }
        });
        if (!game.privateMsgIds[uid]) game.privateMsgIds[uid] = {};
        game.privateMsgIds[uid].cardsMsgId = msg.message_id;
    }
});

function cardButtonsRowDiscardH2(gameId, hand) {
    return hand.map((c) => ({ text: c.code, callback_data: `h2_discard_${gameId}_${c.code}` }));
}

function cardButtonsRowH2(gameId, hand) {
    return hand.map((c) => ({ text: c.code, callback_data: `h2_playcard_${gameId}_${c.code}` }));
}

bot.action(/^h2_discard_([\w]+)_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const cardCode = ctx.match[2];
    const userId = ctx.from.id;
    const game = hokm2Games[gameId];
    if (!game || game.status !== 'discarding') return ctx.answerCbQuery('❌ این مرحله فعال نیست.', { show_alert: true });

    const hand = game.hands[userId];
    const idx = hand.findIndex((c) => c.code === cardCode);
    if (idx === -1) return ctx.answerCbQuery('❌ این کارت رو نداری.', { show_alert: true });

    hand.splice(idx, 1);
    game.discarded[userId] += 1;
    await ctx.answerCbQuery();

    const ids = game.privateMsgIds[userId];
    if (game.discarded[userId] < 2) {
        await ctx.telegram.editMessageReplyMarkup(userId, ids.cardsMsgId, undefined, {
            inline_keyboard: [cardButtonsRowDiscardH2(gameId, hand)]
        }).catch(() => {});
    } else {
        await ctx.telegram.editMessageText(userId, ids.cardsMsgId, undefined, '✅ حذف کارت‌ها انجام شد. منتظر نفر بعدی...').catch(() => {});
    }

    if (game.discarded[game.dealer] >= 2 && game.discarded[game.other] >= 2) {
        startOfferPhase(ctx, gameId);
    }
});

function startOfferPhase(ctx, gameId) {
    const game = hokm2Games[gameId];
    game.status = 'dealing_extra';
    game.dealtCount = { [game.dealer]: 0, [game.other]: 0 };
    game.offerQueue = [];
    for (let i = 0; i < 10; i++) {
        game.offerQueue.push(game.dealer);
        game.offerQueue.push(game.other);
    }
    game.offerIdx = 0;
    offerNextCardH2(ctx, gameId);
}

async function offerNextCardH2(ctx, gameId) {
    const game = hokm2Games[gameId];
    if (!game) return;

    if (game.offerIdx >= game.offerQueue.length) {
        finishDealingH2(ctx, gameId);
        return;
    }

    const userId = game.offerQueue[game.offerIdx];
    if (game.deck.length === 0) {
        finishDealingH2(ctx, gameId);
        return;
    }

    const card = game.deck.shift();
    game.pendingOffer = { userId, card, rejected: false };

    await ctx.telegram.sendMessage(userId, `🃏 کارت پیشنهادی: ${card.code}`, {
        reply_markup: {
            inline_keyboard: [[
                { text: card.code, callback_data: `h2_offer_take_${gameId}` },
                { text: 'کارت بعدی', callback_data: `h2_offer_next_${gameId}` }
            ]]
        }
    });
}

bot.action(/^h2_offer_take_([\w]+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const game = hokm2Games[gameId];
    if (!game || !game.pendingOffer) return ctx.answerCbQuery('❌ الان نوبت این کار نیست.', { show_alert: true });
    if (ctx.from.id !== game.pendingOffer.userId) return ctx.answerCbQuery('❌ این کارت برای تو نیست.', { show_alert: true });

    const { userId, card } = game.pendingOffer;
    game.hands[userId].push(card);
    game.dealtCount[userId] += 1;
    game.pendingOffer = null;
    game.offerIdx += 1;

    await ctx.editMessageText(`✅ کارت ${card.code} اومد توی دستت.`).catch(() => {});
    await updateHandButtonsH2(ctx, gameId, userId);
    offerNextCardH2(ctx, gameId);
});

bot.action(/^h2_offer_next_([\w]+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const game = hokm2Games[gameId];
    if (!game || !game.pendingOffer) return ctx.answerCbQuery('❌ الان نوبت این کار نیست.', { show_alert: true });
    if (ctx.from.id !== game.pendingOffer.userId) return ctx.answerCbQuery('❌ این کارت برای تو نیست.', { show_alert: true });
    if (game.pendingOffer.rejected) return ctx.answerCbQuery('❌ قبلاً رد کردی.', { show_alert: true });

    const userId = game.pendingOffer.userId;
    await ctx.editMessageText(`❌ ${game.pendingOffer.card.code} رو رد کردی...`).catch(() => {});

    if (game.deck.length === 0) {
        game.pendingOffer = null;
        finishDealingH2(ctx, gameId);
        return;
    }

    const newCard = game.deck.shift();
    game.hands[userId].push(newCard);
    game.dealtCount[userId] += 1;
    game.pendingOffer = null;
    game.offerIdx += 1;

    await ctx.telegram.sendMessage(userId, `🃏 چون رد کردی، این کارت اجباریه: ${newCard.code}`);
    await updateHandButtonsH2(ctx, gameId, userId);
    offerNextCardH2(ctx, gameId);
});

async function updateHandButtonsH2(ctx, gameId, userId) {
    const game = hokm2Games[gameId];
    const ids = game.privateMsgIds[userId];
    const hand = game.hands[userId];
    if (!ids) return;

    if (!ids.handMsgId) {
        const msg = await ctx.telegram.sendMessage(userId, 'کارت های شما:', {
            reply_markup: { inline_keyboard: [cardButtonsRowH2(gameId, hand)] }
        });
        ids.handMsgId = msg.message_id;
    } else {
        await ctx.telegram.editMessageReplyMarkup(userId, ids.handMsgId, undefined, {
            inline_keyboard: [cardButtonsRowH2(gameId, hand)]
        }).catch(() => {});
    }
}

async function finishDealingH2(ctx, gameId) {
    const game = hokm2Games[gameId];
    const lost = game.deck.splice(0, Math.min(2, game.deck.length));

    if (lost.length > 0) {
        const text = `🃏 دو کارت از دست رفته:\n${lost.map((c) => c.code).join(' ')}`;
        for (const uid of [game.dealer, game.other]) {
            await ctx.telegram.sendMessage(uid, text).catch(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    game.status = 'playing';
    game.turn = game.dealer;
    game.trick = [];
    game.leadSuit = null;

    // ارسال پیام وضعیت به هر دو نفر (پیوی) + گروه
    for (const uid of [game.dealer, game.other]) {
        const msg = await ctx.telegram.sendMessage(uid, h2StatusText(game));
        game.privateMsgIds[uid].statusMsgId = msg.message_id;
    }
    await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, h2StatusText(game)).catch(() => {});
}

async function updateAllH2(ctx, gameId, extraText) {
    const game = hokm2Games[gameId];
    await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, h2StatusText(game, extraText)).catch(() => {});
    for (const uid of [game.dealer, game.other]) {
        const ids = game.privateMsgIds[uid];
        if (ids && ids.statusMsgId) {
            await ctx.telegram.editMessageText(uid, ids.statusMsgId, undefined, h2StatusText(game, extraText)).catch(() => {});
        }
    }
}

bot.action(/^h2_playcard_([\w]+)_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const cardCode = ctx.match[2];
    const userId = ctx.from.id;
    const game = hokm2Games[gameId];

    if (!game || game.status !== 'playing') return ctx.answerCbQuery('❌ این بازی فعال نیست.', { show_alert: true });
    if (game.turn !== userId) return ctx.answerCbQuery('❌ نوبت تو نیست.', { show_alert: true });

    const hand = game.hands[userId];
    const idx = hand.findIndex((c) => c.code === cardCode);
    if (idx === -1) return ctx.answerCbQuery('❌ این کارت رو نداری.', { show_alert: true });

    const card = hand[idx];

    if (game.trick.length > 0) {
        const hasLeadSuit = hand.some((c) => c.suit === game.leadSuit);
        if (hasLeadSuit && card.suit !== game.leadSuit) {
            return ctx.answerCbQuery(`❌ باید از خال ${game.leadSuit} بندازی.`, { show_alert: true });
        }
    }

    hand.splice(idx, 1);
    game.trick.push({ userId, card });
    if (game.trick.length === 1) game.leadSuit = card.suit;

    await ctx.answerCbQuery();
    await updateHandButtonsH2(ctx, gameId, userId);

    if (game.trick.length < 2) {
        game.turn = userId === game.dealer ? game.other : game.dealer;
        await updateAllH2(ctx, gameId);
        return;
    }

    resolveTrickH2(ctx, gameId);
});

async function resolveTrickH2(ctx, gameId) {
    const game = hokm2Games[gameId];
    const trumpPlays = game.trick.filter((p) => p.card.suit === game.trumpSuit);
    let winnerPlay;
    if (trumpPlays.length > 0) {
        winnerPlay = trumpPlays.reduce((best, p) => (RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank] ? p : best));
    } else {
        const leadPlays = game.trick.filter((p) => p.card.suit === game.leadSuit);
        winnerPlay = leadPlays.reduce((best, p) => (RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank] ? p : best));
    }

    const winnerUserId = winnerPlay.userId;
    game.tricksThisSet[winnerUserId] += 1;
    game.trick = [];
    game.leadSuit = null;

    if (game.tricksThisSet[winnerUserId] >= 7) {
        await finishSetH2(ctx, gameId, winnerUserId);
        return;
    }

    game.trickNum += 1;
    game.turn = winnerUserId;
    await updateAllH2(ctx, gameId);
}

async function finishSetH2(ctx, gameId, winnerUserId) {
    const game = hokm2Games[gameId];
    game.setsWon[winnerUserId] += 1;

    const announceText = `🏆 چه دست پرقدرتی! این ست رو ${nameOf(winnerUserId)} قاپید!`;
    await updateAllH2(ctx, gameId, announceText);

    if (game.setsWon[winnerUserId] >= game.totalSets) {
        setTimeout(() => finishGameH2(ctx, gameId, winnerUserId), 2000);
        return;
    }

    if (game.dealer !== winnerUserId) {
        game.dealer = winnerUserId;
        game.other = game.participants.find((id) => id !== game.dealer);
    }

    game.setNum += 1;

    setTimeout(() => startNewSetH2(ctx, gameId, false), 2000);
}

async function finishGameH2(ctx, gameId, winnerUserId) {
    const game = hokm2Games[gameId];
    const loserUserId = game.participants.find((id) => id !== winnerUserId);

    const finalText =
        `🎉🎉 واااای چه بازی‌ای بود! 🎉🎉\n\n` +
        `👑 برنده\n${nameOf(winnerUserId)}\n\n` +
        `😔 بازنده\n${nameOf(loserUserId)}\n\n` +
        `ممنون که تا آخرش موندین، دمتون گرم! 🙌`;

    await ctx.telegram.editMessageText(game.chatId, game.messageId, undefined, finalText).catch(() => {});
    for (const uid of [game.dealer, game.other]) {
        const ids = game.privateMsgIds[uid];
        if (ids && ids.statusMsgId) {
            await ctx.telegram.editMessageText(uid, ids.statusMsgId, undefined, finalText).catch(() => {});
        }
    }

    delete hokm2Games[gameId];
}

// ------------------------------
// اجرا
// ------------------------------
bot.launch();
console.log('ربات با موفقیت اجرا شد ✅');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
