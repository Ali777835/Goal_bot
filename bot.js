// ==============================
// دو ربات مستقل تلگرامی در یک فایل
// ۱) ربات بازی (دوز + شرط‌بندی)
// ۲) ربات قرعه‌کشی
// هر کدوم توکن، لیست مدیرا، دیتابیس و منطق کاملاً جدای خودشون رو دارن
// ==============================
// نصب: npm install telegraf sqlite3
// اجرا: node bot.js

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ==============================================================
// بخش ۱: ربات بازی (دوز + شرط‌بندی)
// ==============================================================

// ==============================
// ربات بازی تلگرامی - دوز + شرط‌بندی
// ==============================

const GAME_TOKEN = process.env.GAME_BOT_TOKEN || '8822138899:AAE5GoBAeFpfflmwMwcdSOwmL-xyBIAXa_I';
const GAME_ADMIN_ID = parseInt(process.env.GAME_ADMIN_ID || '7744236569');

const gameBot = new Telegraf(GAME_TOKEN);

// ------------------------------
// دیتابیس (موجودی الماس)
// ------------------------------
const gameDbPath = path.join(__dirname, 'game_data.db');
const gameDb = new sqlite3.Database(gameDbPath);

gameDb.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        diamonds INTEGER DEFAULT 0
    )
`);

function gameGetUser(userId, callback) {
    gameDb.get('SELECT * FROM users WHERE user_id = ?', [userId], (_err, row) => {
        if (!row) {
            gameDb.run('INSERT INTO users (user_id, diamonds) VALUES (?, 0)', [userId], () => {
                gameDb.get('SELECT * FROM users WHERE user_id = ?', [userId], (_e, newRow) => callback(newRow));
            });
        } else {
            callback(row);
        }
    });
}

function gameUpdateUser(userId, data, callback) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    gameDb.run(`UPDATE users SET ${setClause} WHERE user_id = ?`, [...values, userId], callback || (() => {}));
}

const gameNameCache = {};
function gameRememberName(user) {
    if (user && user.id) gameNameCache[user.id] = user.first_name || 'کاربر';
}
function gameNameOf(userId) {
    return gameNameCache[userId] || `کاربر ${userId}`;
}

gameBot.use((ctx, next) => {
    if (ctx.from) gameRememberName(ctx.from);
    return next();
});

// ------------------------------
// منوی اصلی (خصوصی)
// ------------------------------
function gameMainMenuKeyboard() {
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

function gameMainMenuText(name, diamonds) {
    return `✨ سلام ${name} عزیز! ✨\nبه دنیای بازی خوش اومدی 🎮\n\n💎 موجودی فعلیت: ${diamonds}\n\nیکی از گزینه‌های پایین رو انتخاب کن:`;
}

gameBot.start((ctx) => {
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

    gameGetUser(userId, (user) => {
        ctx.reply(gameMainMenuText(name, user.diamonds), gameMainMenuKeyboard());
    });
});

gameBot.action('back', (ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'رفیق';
    gameGetUser(userId, (user) => {
        ctx.editMessageText(gameMainMenuText(name, user.diamonds), gameMainMenuKeyboard()).catch(() => {
            ctx.reply(gameMainMenuText(name, user.diamonds), gameMainMenuKeyboard());
        });
    });
});

// ------------------------------
// درخواست الماس رایگان
// ------------------------------
const gameRequestTemp = {};

function gameNumpadKeyboard() {
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

function gameNumpadText(display) {
    return `💎 چند تا الماس می‌خوای درخواست بدی؟\nعدد مورد نظرت رو با دکمه‌های پایین وارد کن ✏️\n\n🔢 مقدار فعلی: ${display}`;
}

gameBot.action('request_diamonds', (ctx) => {
    gameRequestTemp[ctx.from.id] = '';
    ctx.editMessageText(gameNumpadText('0'), gameNumpadKeyboard()).catch(() => {
        ctx.reply(gameNumpadText('0'), gameNumpadKeyboard());
    });
});

gameBot.action(/^req_num_(.+)$/, (ctx) => {
    const userId = ctx.from.id;
    const val = ctx.match[1];
    const current = gameRequestTemp[userId] || '';

    if (val === '✓') {
        const amount = parseInt(current);
        if (!amount || amount <= 0) {
            return ctx.answerCbQuery('❌ اول یه عدد معتبر وارد کن!', { show_alert: true });
        }
        if (!GAME_ADMIN_ID) {
            return ctx.answerCbQuery('⚠️ ادمین هنوز تنظیم نشده.', { show_alert: true });
        }

        delete gameRequestTemp[userId];
        const name = ctx.from.first_name || 'یه کاربر';

        ctx.editMessageText(`✅ درخواستت (💎 ${amount}) به مدیر ارسال شد.\n⏳ منتظر بمون تا لطف کنه و تاییدش کنه 🙏`).catch(() => {
            ctx.reply(`✅ درخواستت (💎 ${amount}) به مدیر ارسال شد.\n⏳ منتظر بمون تا لطف کنه و تاییدش کنه 🙏`);
        });

        ctx.telegram.sendMessage(
            GAME_ADMIN_ID,
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
        gameRequestTemp[userId] = current.slice(0, -1);
    } else {
        if (current.length >= 6) return;
        gameRequestTemp[userId] = current + val;
    }

    const display = gameRequestTemp[userId] || '0';
    ctx.editMessageText(gameNumpadText(display), gameNumpadKeyboard()).catch(() => {});
});

gameBot.action(/^req_accept_(\d+)_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const amount = parseInt(ctx.match[2]);

    gameGetUser(userId, (user) => {
        gameUpdateUser(userId, { diamonds: user.diamonds + amount }, () => {
            ctx.editMessageText(`✅ تایید شد! 💎 ${amount} به کاربر ${userId} اضافه شد.`).catch(() => {});
            ctx.telegram.sendMessage(userId, `🎉🎁 مدیر لطف کرد و 💎 ${amount} بهت اضافه کرد! نوش جونت 😍`);
        });
    });
});

gameBot.action(/^req_reject_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.editMessageText('❌ رد شد.').catch(() => {});
    ctx.telegram.sendMessage(userId, '😅 مدیر این بار رد کرد، یه وقت دیگه امتحان کن رفیق!');
});

// ------------------------------
// حساب کاربری
// ------------------------------
gameBot.action('account', (ctx) => {
    const userId = ctx.from.id;
    gameGetUser(userId, (user) => {
        ctx.editMessageText(
            `👤✨ حساب کاربری شما ✨\n\n🆔 آیدی: ${userId}\n💎 تعداد الماس: ${user.diamonds}`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 برگشت', callback_data: 'back' }]] } }
        ).catch(() => {});
    });
});

// ------------------------------
// پیشنهاد بازی
// ------------------------------
const gameAwaitingSuggestion = new Set();

gameBot.action('suggest', (ctx) => {
    gameAwaitingSuggestion.add(ctx.from.id);
    ctx.editMessageText('💡 بازی پیشنهادیت رو بنویس، با کمال میل می‌خونمش 😊').catch(() => {
        ctx.reply('💡 بازی پیشنهادیت رو بنویس، با کمال میل می‌خونمش 😊');
    });
});

// ------------------------------
// دکمه‌ی بازی (منو)
// ------------------------------
gameBot.action('game', (ctx) => {
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
gameBot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (ctx.chat.type === 'private' && gameAwaitingSuggestion.has(userId)) {
        gameAwaitingSuggestion.delete(userId);
        ctx.reply('👌 باشه، فرستادم پیش مدیر. نتیجه رو بهت می‌گم 😉');

        if (GAME_ADMIN_ID) {
            ctx.telegram.sendMessage(
                GAME_ADMIN_ID,
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

gameBot.action(/^suggest_accept_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.editMessageText('✅ تایید شد.').catch(() => {});
    ctx.telegram.sendMessage(userId, '🎉 پیشنهادت تایید شد، ایده‌ی خیلی خوبی بود! 👏');
});

gameBot.action(/^suggest_reject_(\d+)$/, (ctx) => {
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
        `کاربر 🔴\n${gameNameOf(game.colors.red)}\n\n` +
        `کاربر 🔵\n${gameNameOf(game.colors.blue)}\n\n` +
        `نوبت ${turnSymbol}`
    );
}

gameBot.hears(/^دوز (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی دوز فقط داخل گروه انجام می‌شه.');
    if (amount < DOZ_MIN_BET) return ctx.reply(`❌ حداقل شرط برای دوز ${DOZ_MIN_BET} الماسه.`);

    gameGetUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        gameUpdateUser(userId, { diamonds: user.diamonds - amount }, () => {
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

gameBot.action(/^doz_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = dozGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی شروع شده.', { show_alert: true });

    gameGetUser(userId, (user) => {
        gameUpdateUser(userId, { diamonds: user.diamonds + game.amount }, () => {
            delete dozGames[gameId];
            ctx.editMessageText('❌ بازی دوز لغو شد.').catch(() => {});
        });
    });
});

gameBot.action(/^doz_join_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = dozGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی پر شده یا شروع شده.', { show_alert: true });
    if (game.creator === userId) return ctx.answerCbQuery('❌ نمی‌تونی به بازی خودت بپیوندی.', { show_alert: true });

    gameGetUser(userId, (user) => {
        if (user.diamonds < game.amount) {
            return ctx.answerCbQuery(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`, { show_alert: true });
        }

        gameUpdateUser(userId, { diamonds: user.diamonds - game.amount }, () => {
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

gameBot.action(/^doz_move_([\w]+)_(\d)$/, (ctx) => {
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

        gameGetUser(winnerUser, (winner) => {
            const winnerNew = winner.diamonds + game.prize;
            gameUpdateUser(winnerUser, { diamonds: winnerNew }, () => {
                gameGetUser(loserUser, (loser) => {
                    ctx.editMessageText(
                        `🎉 وای وای وای! بازی تموم شد!\n\n🥇 قهرمان میدون\n${gameNameOf(winnerUser)}\n\n😅 بازنده‌ی بدشانس\n${gameNameOf(loserUser)}`,
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

gameBot.hears(/^بازی (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی شرط‌بندی فقط داخل گروه انجام می‌شه.');
    if (amount < BET_MIN) return ctx.reply(`❌ حداقل شرط ${BET_MIN} الماسه.`);

    gameGetUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        gameUpdateUser(userId, { diamonds: user.diamonds - amount }, () => {
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

gameBot.action(/^bet_join_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی تموم شده.', { show_alert: true });
    if (game.creator === userId) return ctx.answerCbQuery('❌ نمی‌تونی به بازی خودت بپیوندی.', { show_alert: true });
    if (game.players.includes(userId)) return ctx.answerCbQuery('❌ قبلاً پیوستی.', { show_alert: true });

    gameGetUser(userId, (user) => {
        if (user.diamonds < game.amount) {
            return ctx.answerCbQuery(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`, { show_alert: true });
        }

        gameUpdateUser(userId, { diamonds: user.diamonds - game.amount }, () => {
            game.players.push(userId);
            game.status = 'complete';

            ctx.editMessageText(
                `🎲 شرط‌بندی داغه!\n\n👤 بازیکن اول: ${gameNameOf(game.players[0])}\n👤 بازیکن دوم: ${gameNameOf(game.players[1])}\n\n🔮 در حال مشخص شدن برنده...`
            ).catch(() => {});

            setTimeout(() => {
                const winner = game.players[Math.floor(Math.random() * game.players.length)];
                const loser = game.players.find((p) => p !== winner);

                gameGetUser(winner, (winnerUser) => {
                    const winnerNew = winnerUser.diamonds + game.prize;
                    gameUpdateUser(winner, { diamonds: winnerNew }, () => {
                        gameGetUser(loser, (loserUser) => {
                            ctx.reply(
                                `🎉✨ نتیجه‌ی شرط‌بندی! ✨🎉\n\n🥇 برنده: ${gameNameOf(winner)}\n😅 بازنده: ${gameNameOf(loser)}\n🎁 جایزه: 💎 ${game.prize}`,
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

gameBot.action(/^bet_cancel_([\w]+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.creator !== userId) return ctx.answerCbQuery('❌ فقط سازنده می‌تونه لغو کنه.', { show_alert: true });

    gameGetUser(userId, (user) => {
        gameUpdateUser(userId, { diamonds: user.diamonds + game.amount }, () => {
            delete betGames[gameId];
            ctx.editMessageText('❌ بازی لغو شد.').catch(() => {});
        });
    });
});

gameBot.hears(/^بازی (\d+) با ربات$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    if (ctx.chat.type === 'private') return ctx.reply('❌ بازی شرط‌بندی فقط داخل گروه انجام می‌شه.');
    if (amount < BET_MIN) return ctx.reply(`❌ حداقل شرط ${BET_MIN} الماسه.`);

    gameGetUser(userId, (user) => {
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نداری. موجودی: ${user.diamonds}`);

        const gameId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        betGames[gameId] = { creator: 'bot', amount, prize: amount * 2, players: ['bot'], status: 'waiting' };

        gameUpdateUser(userId, { diamonds: user.diamonds - amount }, () => {
            ctx.reply(betWaitingWithBotText(amount), {
                reply_markup: { inline_keyboard: [[{ text: '➕ پیوستن', callback_data: `betbot_join_${gameId}_${userId}` }]] }
            });
        });
    });
});

gameBot.action(/^betbot_join_([\w]+)_(\d+)$/, (ctx) => {
    const gameId = ctx.match[1];
    const expectedUserId = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const game = betGames[gameId];

    if (!game) return ctx.answerCbQuery('❌ این بازی وجود نداره.', { show_alert: true });
    if (game.status !== 'waiting') return ctx.answerCbQuery('❌ بازی تموم شده.', { show_alert: true });
    if (userId !== expectedUserId) return ctx.answerCbQuery('❌ این بازی برای تو نیست.', { show_alert: true });

    game.players.push(userId);
    game.status = 'complete';

    ctx.editMessageText(`🤖🎲 چالش شروع شد!\n\nربات در برابر: ${gameNameOf(userId)}\n\n🔮 در حال مشخص شدن برنده...`).catch(() => {});

    setTimeout(() => {
        const winner = game.players[Math.floor(Math.random() * game.players.length)];

        if (winner === 'bot') {
            ctx.reply(
                `🤖 نتیجه‌ی چالش!\n\n🏆 برنده: ربات\n😅 بازنده: ${gameNameOf(userId)}\n\nاین بار شانس با ربات بود، دفعه‌ی بعد بهتر می‌شی! 🍀`
            );
        } else {
            gameGetUser(userId, (winnerUser) => {
                const winnerNew = winnerUser.diamonds + game.prize;
                gameUpdateUser(userId, { diamonds: winnerNew }, () => {
                    ctx.reply(
                        `🎉 نتیجه‌ی چالش!\n\n🥇 برنده: ${gameNameOf(userId)}\n🤖 بازنده: ربات\n🎁 جایزه: 💎 ${game.prize}`,
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
gameBot.hears('موجودی من', (ctx) => {
    gameGetUser(ctx.from.id, (user) => {
        ctx.reply(`💎✨ موجودی شما: ${user.diamonds} ✨💎`);
    });
});

gameBot.hears(/^انتقال (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);
    const reply = ctx.message.reply_to_message;

    if (!reply) return ctx.reply('❌ باید روی پیام کاربر گیرنده ریپلای کنی.');
    const targetUserId = reply.from.id;
    if (targetUserId === userId) return ctx.reply('❌ نمی‌تونی به خودت انتقال بدی.');
    if (amount <= 0) return ctx.reply('❌ مقدار نامعتبره.');

    gameGetUser(userId, (sender) => {
        if (sender.diamonds < amount) return ctx.reply(`❌ خودت الماس کافی نداری. موجودی: ${sender.diamonds}`);

        gameUpdateUser(userId, { diamonds: sender.diamonds - amount }, () => {
            gameGetUser(targetUserId, (receiver) => {
                const receiverNew = receiver.diamonds + amount;
                gameUpdateUser(targetUserId, { diamonds: receiverNew }, () => {
                    ctx.reply(
                        `🔄✨ انتقال الماس ✨\n\n💎 مقدار: ${amount}\n👤 فرستنده: ${gameNameOf(userId)}\n👤 گیرنده: ${gameNameOf(targetUserId)}`,
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

// ==============================================================
// بخش ۲: ربات قرعه‌کشی
// ==============================================================

const RAFFLE_TOKEN = process.env.RAFFLE_BOT_TOKEN || '8955378151:AAGxpTcLJ2yghxIw9yDo4dsbPmDcaSqHqHg';
const RAFFLE_ADMIN_IDS = [8800727588, 7660204118];

const raffleBot = new Telegraf(RAFFLE_TOKEN);

function isRaffleAdmin(userId) {
    return RAFFLE_ADMIN_IDS.includes(userId);
}

// ------------------------------
// دیتابیس (کاربرانی که استارت زدن)
// ------------------------------
const raffleDbPath = path.join(__dirname, 'raffle_data.db');
const raffleDb = new sqlite3.Database(raffleDbPath);

raffleDb.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        started INTEGER DEFAULT 0
    )
`);

function markStarted(userId, callback) {
    raffleDb.run('INSERT OR IGNORE INTO users (user_id, started) VALUES (?, 1)', [userId], () => {
        raffleDb.run('UPDATE users SET started = 1 WHERE user_id = ?', [userId], callback || (() => {}));
    });
}

function hasStarted(userId, callback) {
    raffleDb.get('SELECT started FROM users WHERE user_id = ?', [userId], (_err, row) => {
        callback(!!(row && row.started));
    });
}

function getAllStartedUsers(callback) {
    raffleDb.all('SELECT user_id FROM users WHERE started = 1', [], (_err, rows) => {
        callback((rows || []).map((r) => r.user_id));
    });
}

// کش نام‌ها
const raffleNameCache = {};
function raffleRememberName(user) {
    if (user && user.id) raffleNameCache[user.id] = user.first_name || 'کاربر';
}
function raffleNameOf(userId) {
    return raffleNameCache[userId] || `کاربر ${userId}`;
}

raffleBot.use((ctx, next) => {
    if (ctx.from) raffleRememberName(ctx.from);
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
        lines += `${i + 1}. ${uid ? raffleNameOf(uid) : '—'}\n`;
    }
    lines += `\n⏳ منتظر باش ${raffleNameOf(raffle.creator)} عزیز.....`;
    return lines;
}

function readyText(raffle) {
    let lines = `واااای 🥳🎊\nحالا همه شرکت کردن!\n\nکاربرانی که شرکت کردن:\n`;
    for (let i = 0; i < raffle.needed; i++) {
        lines += `${i + 1}. ${raffleNameOf(raffle.participants[i])}\n`;
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
        lines += `${idx + 1}. ${raffleNameOf(uid)}\n`;
    });
    lines += `\n✨ برای ساخت قرعه‌کشی جدید دکمه‌ی زیر رو بزن ✨`;
    return lines;
}

// ------------------------------
// استارت
// ------------------------------
raffleBot.start((ctx) => {
    if (ctx.chat.type !== 'private') return;

    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'رفیق';

    if (isRaffleAdmin(userId)) {
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
raffleBot.action('raffle_create', (ctx) => {
    const userId = ctx.from.id;
    if (!isRaffleAdmin(userId)) return ctx.answerCbQuery('❌ فقط مدیرها می‌تونن قرعه‌کشی بسازن.', { show_alert: true });
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

raffleBot.action(/^raffle_count_([\w]+)_(\d)$/, async (ctx) => {
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
raffleBot.action(/^raffle_join_([\w]+)$/, async (ctx) => {
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
raffleBot.action(/^raffle_start_([\w]+)$/, async (ctx) => {
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

    lastWinners = winners.map((uid) => raffleNameOf(uid));

    await ctx.editMessageText(winnersText(raffle, winners), {
        reply_markup: { inline_keyboard: [[{ text: '🎟 قرعه‌کشی جدید', callback_data: 'raffle_create' }]] }
    }).catch(() => {});

    currentRaffle = null;
});

// ------------------------------
// نمایش برندگان دور قبل
// ------------------------------
raffleBot.action('raffle_prev_winners', (ctx) => {
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
// اجرای هر دو ربات
// ------------------------------
gameBot.launch();
console.log('✅ ربات بازی (دوز + شرط‌بندی) با موفقیت اجرا شد');

raffleBot.launch();
console.log('✅ ربات قرعه‌کشی با موفقیت اجرا شد');

process.once('SIGINT', () => {
    gameBot.stop('SIGINT');
    raffleBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    gameBot.stop('SIGTERM');
    raffleBot.stop('SIGTERM');
});
