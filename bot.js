// ==============================
// ربات بازی تلگرامی - دوز + شرط‌بندی
// ==============================
// نصب: npm install telegraf sqlite3
// اجرا: node bot.js

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TOKEN = process.env.BOT_TOKEN || '8822138899:AAE5GoBAeFpfflmwMwcdSOwmL-xyBIAXa_I';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7744236569');

const bot = new Telegraf(TOKEN);

// ------------------------------
// دیتابیس (موجودی الماس)
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

// کش نام کاربرا برای نمایش (به‌جای آیدی عددی)
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
                    '🎲 برای بازی شرط‌بندی بنویس: بازی 20\n' +
                    '🤖 برای بازی با خود ربات بنویس: بازی 20 با ربات\n\n' +
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
        '🎮✨ بازی‌های فعلی ✨🎮\n\n🃏 دوز\n🎲 شرط‌بندی\n\nبرای شروع بازی، منو به گروهت اضافه کن 👇',
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
// بازی شرط‌بندی (کاربر با کاربر یا کاربر با ربات)
// ==============================
const betGames = {};
const BET_MIN = 20;

function betWaitingText(amount) {
    return `🎲✨ یه شرط‌بندی آتیشین راه افتاد! ✨🎲\n\n💎 مقدار شرط: ${amount}\n🎁 جایزه‌ی برنده: ${amount * 2}\n\nکی می‌خواد شانسش رو امتحان کنه؟ بزن پیوستن! 🔥`;
}

function betWaitingWithBotText(amount) {
    return `🤖🎲 چالش با خود ربات! 🎲🤖\n\n💎 مقدار شرط: ${amount}\n🎁 جایزه‌ی برنده: ${amount * 2}\n\nجرأتشو داری؟ بزن پیوستن ببینیم شانس با کیه! 😏`;
}

bot.hears(/^بازی (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی شرط‌بندی فقط داخل گروه انجام می‌شه.');
    if (amount < BET_MIN) return ctx.reply(`❌ حداقل شرط ${BET_MIN} الماسه.`);

    getUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        updateUser(userId, { diamonds: user.diamonds - amount }, () => {
            const gameId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            betGames[gameId] = { creator: userId, amount, prize: amount * 2, players: [userId], status: 'waiting' };

            ctx.reply(betWaitingText(amount), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ پیوستن', callback_data: `bet_join_${gameId}` }],
                        [{ text: '❌ لغو', callback_data: `bet_cancel_${gameId}` }]
                    ]
                }
            });
        });
    });
});

bot.action(/^bet_join_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی تموم شده.', { show_alert: true });
    if (game.creator === userId) return ctx.answerCbQuery('❌ نمی‌تونی به بازی خودت بپیوندی.', { show_alert: true });
    if (game.players.includes(userId)) return ctx.answerCbQuery('❌ قبلاً پیوستی.', { show_alert: true });

    getUser(userId, (user) => {
        if (user.diamonds < game.amount) {
            return ctx.answerCbQuery(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`, { show_alert: true });
        }

        updateUser(userId, { diamonds: user.diamonds - game.amount }, () => {
            game.players.push(userId);
            game.status = 'complete';

            ctx.editMessageText(
                `🎲 شرط‌بندی داغه!\n\n👤 بازیکن اول: ${nameOf(game.players[0])}\n👤 بازیکن دوم: ${nameOf(game.players[1])}\n\n🔮 در حال مشخص شدن برنده...`
            ).catch(() => {});

            setTimeout(() => {
                const winner = game.players[Math.floor(Math.random() * game.players.length)];
                const loser = game.players.find((p) => p !== winner);

                getUser(winner, (winnerUser) => {
                    const winnerNew = winnerUser.diamonds + game.prize;
                    updateUser(winner, { diamonds: winnerNew }, () => {
                        getUser(loser, (loserUser) => {
                            ctx.reply(
                                `🎉✨ نتیجه‌ی شرط‌بندی! ✨🎉\n\n🥇 برنده: ${nameOf(winner)}\n😅 بازنده: ${nameOf(loser)}\n🎁 جایزه: 💎 ${game.prize}`,
                                {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: `💰 موجودی برنده: ${winnerNew}`, callback_data: 'dummy' }],
                                            [{ text: `💰 موجودی بازنده: ${loserUser.diamonds}`, callback_data: 'dummy' }]
                                        ]
                                    }
                                }
                            );
                            delete betGames[gameId];
                        });
                    });
                });
            }, 3000);
        });
    });
});

bot.action(/^bet_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });

    getUser(userId, (user) => {
        updateUser(userId, { diamonds: user.diamonds + game.amount }, () => {
            delete betGames[gameId];
            ctx.editMessageText('❌ بازی لغو شد.').catch(() => {});
        });
    });
});

bot.hears(/^بازی (\d+) با ربات$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی شرط‌بندی فقط داخل گروه انجام می‌شه.');
    if (amount < BET_MIN) return ctx.reply(`❌ حداقل شرط ${BET_MIN} الماسه.`);

    getUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        const gameId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        betGames[gameId] = { creator: 'bot', amount, prize: amount * 2, players: ['bot'], status: 'waiting' };

        updateUser(userId, { diamonds: user.diamonds - amount }, () => {
            ctx.reply(betWaitingWithBotText(amount), {
                reply_markup: { inline_keyboard: [[{ text: '➕ پیوستن', callback_data: `betbot_join_${gameId}_${userId}` }]] }
            });
        });
    });
});

bot.action(/^betbot_join_([\w]+)_(\d+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const expectedUserId = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی تموم شده.', { show_alert: true });
    if (userId !== expectedUserId) return ctx.answerCbQuery('❌ این بازی برای تو نیست.', { show_alert: true });

    game.players.push(userId);
    game.status = 'complete';

    ctx.editMessageText(`🤖🎲 چالش شروع شد!\n\nربات در برابر: ${nameOf(userId)}\n\n🔮 در حال مشخص شدن برنده...`).catch(() => {});

    setTimeout(() => {
        const winner = game.players[Math.floor(Math.random() * game.players.length)];

        if (winner === 'bot') {
            ctx.reply(
                `🤖 نتیجه‌ی چالش!\n\n🏆 برنده: ربات\n😅 بازنده: ${nameOf(userId)}\n\nاین بار شانس با ربات بود، دفعه‌ی بعد بهتر می‌شی! 🍀`
            );
        } else {
            getUser(userId, (winnerUser) => {
                const winnerNew = winnerUser.diamonds + game.prize;
                updateUser(userId, { diamonds: winnerNew }, () => {
                    ctx.reply(
                        `🎉 نتیجه‌ی چالش!\n\n🥇 برنده: ${nameOf(userId)}\n🤖 بازنده: ربات\n🎁 جایزه: 💎 ${game.prize}`,
                        { reply_markup: { inline_keyboard: [[{ text: `💰 موجودی جدیدت: ${winnerNew}`, callback_data: 'dummy' }]] } }
                    );
                });
            });
        }
        delete betGames[gameId];
    }, 3000);
});

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

// ------------------------------
// اجرا
// ------------------------------
bot.launch();
console.log('ربات با موفقیت اجرا شد ✅');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
