// ==========================================
// 📦 کتابخانه‌ها
// ==========================================
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ==========================================
// 🔐 تنظیمات
// ==========================================
const TOKEN = '7980096496:AAEza-CUFjxG-e6u2Y-NJkgJUK4i73dg3iY';
const ADMIN_ID = 7744236569;
const bot = new Telegraf(TOKEN);

// ==========================================
// 📂 دیتابیس
// ==========================================
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        diamonds INTEGER DEFAULT 100,
        has_received_bonus INTEGER DEFAULT 0
    )
`);

// ==========================================
// 🧠 توابع کمکی
// ==========================================
function getUser(userId, callback) {
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (_err, row) => {
        if (!row) {
            db.run('INSERT INTO users (user_id, diamonds) VALUES (?, 100)', [userId], () => {
                db.get('SELECT * FROM users WHERE user_id = ?', [userId], (_err, newRow) => {
                    callback(newRow);
                });
            });
        } else {
            callback(row);
        }
    });
}

function updateUser(userId, data, callback) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    db.run(`UPDATE users SET ${setClause} WHERE user_id = ?`, [...values, userId], callback);
}

// ==========================================
// 🏠 /start
// ==========================================
bot.start((ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'کاربر';
    const chatType = ctx.chat.type;

    if (chatType === 'group' || chatType === 'supergroup') {
        ctx.getChatMember(ctx.botInfo.id).then((botMember) => {
            if (botMember.status === 'administrator' || botMember.status === 'creator') {
                ctx.reply(`✅ ربات در این گروه فعال شد!\nبرای مشاهده منو /start رو بزن.`);
            } else {
                ctx.reply('❌ لطفاً ابتدا ربات را در گروه ادمین کنید.');
            }
        }).catch(() => {
            ctx.reply('❌ خطا در بررسی وضعیت ادمین.');
        });
        return;
    }

    getUser(userId, (user) => {
        let message = `سلام ${name} عزیز! 👋\nبه ربات **Goal Challenge** خوش اومدی! 🏆\n\n`;

        if (!user.has_received_bonus) {
            updateUser(userId, { diamonds: user.diamonds + 100, has_received_bonus: 1 }, () => {
                getUser(userId, (updatedUser) => {
                    ctx.reply(
                        message +
                        `🎁 ۱۰۰ الماس هدیه گرفتی! 💎\n` +
                        `💰 الماس فعلی: ${updatedUser.diamonds}\n\n` +
                        `لطفاً یکی از گزینه‌ها رو انتخاب کن:`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔵 خرید الماس', callback_data: 'buy' }],
                                    [{ text: '🟢 شرط‌بندی', callback_data: 'betting' }]
                                ]
                            }
                        }
                    );
                });
            });
        } else {
            ctx.reply(
                message +
                `💰 الماس فعلی: ${user.diamonds}\n\n` +
                `لطفاً یکی از گزینه‌ها رو انتخاب کن:`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔵 خرید الماس', callback_data: 'buy' }],
                            [{ text: '🟢 شرط‌بندی', callback_data: 'betting' }]
                        ]
                    }
                }
            );
        }
    });
});

// ==========================================
// 💎 خرید الماس
// ==========================================
bot.action('buy', (ctx) => {
    ctx.reply(
        '💎 **خرید الماس** 💎\n\n' +
        '💰 قیمت هر الماس: ۱,۰۰۰ تومان\n\n' +
        '💳 شماره کارت: `6219 8614 3997 6183`\n' +
        '👤 نام صاحب حساب: **کریم جاهدی**\n\n' +
        '📌 بعد از واریز، عکس رسید رو بفرست.'
    );
});

// ==========================================
// 🎲 شرط‌بندی
// ==========================================
bot.action('betting', (ctx) => {
    ctx.reply(
        '⚽️ **شرط‌بندی فوتبالی** 🔥\n\n' +
        'تمام شرط‌بندی‌ها فقط داخل گروه رسمی انجام میشه:\n' +
        '👉 [Goal Challenges | Chat](https://t.me/+6rdjXhUNLLY5Y2Q0)\n\n' +
        '📌 برای شرکت در شرط‌بندی، حتماً عضو گروه بشید و قوانین رو مطالعه کنید.\n\n' +
        '🎯 **بدو شرط‌بندی کن!**',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔗 پیوستن به گروه شرط‌بندی', url: 'https://t.me/+6rdjXhUNLLY5Y2Q0' }]
                ]
            }
        }
    );
});

// ==========================================
// 📸 دریافت عکس رسید از کاربر
// ==========================================
bot.on('photo', (ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || 'کاربر';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'ندارد';

    const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    ctx.telegram.sendPhoto(
        ADMIN_ID,
        photo,
        {
            caption: `📸 **رسید جدید**\n\n` +
                     `👤 نام: ${name}\n` +
                     `🆔 آیدی: ${userId}\n` +
                     `🔹 یوزرنیم: ${username}\n\n` +
                     `لطفاً یکی از گزینه‌ها رو انتخاب کن:`,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ تایید', callback_data: `confirm_${userId}` }],
                    [{ text: '❌ رد', callback_data: `reject_${userId}` }]
                ]
            }
        }
    );

    ctx.reply('✅ رسید شما دریافت شد. در اسرع وقت بررسی و الماس‌ها به حسابتان اضافه می‌شود.');
});

// ==========================================
// ✅ تایید رسید توسط مدیر (با دکمه‌های عددی)
// ==========================================
let tempAmount = {};

bot.action(/^confirm_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    tempAmount[ctx.from.id] = '';
    
    ctx.reply(
        `💰 **چقدر الماس کاربر خرید؟**\n\n` +
        `مقدار: \`${tempAmount[ctx.from.id] || '0'}\``,
        {
            reply_markup: {
                inline_keyboard: [
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['✅', '0', '×']
                ].map(row => row.map(num => ({
                    text: num,
                    callback_data: num === '✅' ? `final_confirm_${userId}` : 
                                  num === '×' ? `backspace_${userId}` : 
                                  `num_${userId}_${num}`
                })))
            }
        }
    );
});

// ==========================================
// 🔢 دکمه‌های عددی
// ==========================================
bot.action(/^num_(\d+)_(\d)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const digit = ctx.match[2];
    const adminId = ctx.from.id;
    
    if (!tempAmount[adminId]) tempAmount[adminId] = '';
    
    if (tempAmount[adminId] === '0' && digit !== '0') {
        tempAmount[adminId] = digit;
    } else if (tempAmount[adminId] === '0' && digit === '0') {
        // هیچی
    } else {
        tempAmount[adminId] += digit;
    }
    
    if (tempAmount[adminId].length > 10) {
        tempAmount[adminId] = tempAmount[adminId].slice(0, 10);
    }
    
    ctx.editMessageText(
        `💰 **چقدر الماس کاربر خرید؟**\n\n` +
        `مقدار: \`${tempAmount[adminId] || '0'}\``,
        {
            reply_markup: {
                inline_keyboard: [
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['✅', '0', '×']
                ].map(row => row.map(num => ({
                    text: num,
                    callback_data: num === '✅' ? `final_confirm_${userId}` : 
                                  num === '×' ? `backspace_${userId}` : 
                                  `num_${userId}_${num}`
                })))
            }
        }
    );
});

// ==========================================
// ⌫ دکمه پاک‌کن (×)
// ==========================================
bot.action(/^backspace_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const adminId = ctx.from.id;
    
    if (tempAmount[adminId] && tempAmount[adminId].length > 0) {
        tempAmount[adminId] = tempAmount[adminId].slice(0, -1);
    }
    
    if (!tempAmount[adminId] || tempAmount[adminId].length === 0) {
        tempAmount[adminId] = '0';
    }
    
    ctx.editMessageText(
        `💰 **چقدر الماس کاربر خرید؟**\n\n` +
        `مقدار: \`${tempAmount[adminId] || '0'}\``,
        {
            reply_markup: {
                inline_keyboard: [
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['✅', '0', '×']
                ].map(row => row.map(num => ({
                    text: num,
                    callback_data: num === '✅' ? `final_confirm_${userId}` : 
                                  num === '×' ? `backspace_${userId}` : 
                                  `num_${userId}_${num}`
                })))
            }
        }
    );
});

// ==========================================
// ✅ تایید نهایی مقدار
// ==========================================
bot.action(/^final_confirm_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const adminId = ctx.from.id;
    const amount = parseInt(tempAmount[adminId] || '0');
    
    if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ عدد معتبر نیست. دوباره تلاش کن.');
    }
    
    getUser(userId, (user) => {
        updateUser(userId, { diamonds: user.diamonds + amount }, () => {
            ctx.reply(`✅ ${amount} الماس به کاربر ${userId} اضافه شد.`);
            bot.telegram.sendMessage(userId, `✅ ${amount} الماس به حسابتان اضافه شد.`);
            delete tempAmount[adminId];
        });
    });
});

// ==========================================
// ❌ رد رسید توسط مدیر
// ==========================================
bot.action(/^reject_(\d+)$/, (ctx) => {
    const userId = parseInt(ctx.match[1]);
    ctx.reply(`❌ رسید کاربر ${userId} رد شد.`);
    bot.telegram.sendMessage(userId, '❌ متأسفانه رسید شما تایید نشد. لطفاً دوباره تلاش کن.');
});

// ==========================================
// 🎮 بازی با کاربر (با عکس و دکمه‌های رنگی)
// ==========================================
const games = {};

bot.hears(/^بازی (\d+)$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    getUser(userId, (user) => {
        if (amount < 20) return ctx.reply('❌ حداقل ورود به بازی ۲۰ الماس است.');
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نیست! شما ${user.diamonds} الماس دارید.`);

        updateUser(userId, { diamonds: user.diamonds - amount }, () => {
            const gameId = Date.now() + Math.random();
            games[gameId] = {
                creator: userId,
                amount: amount,
                prize: amount * 2,
                players: [userId],
                status: 'waiting'
            };

            ctx.replyWithPhoto(
                'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                {
                    caption: 
`Goal Challenge  

💰 مقدار الماس: ${amount}  
🎁 جایزه برنده: ${amount * 2}  

برای شروع بازی، نفر دوم روی پیوستن بزند.`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ پیوستن', callback_data: `join_${gameId}` }],
                            [{ text: '❌ لغو بازی', callback_data: `cancel_${gameId}` }]
                        ]
                    }
                }
            );
        });
    });
});

// ==========================================
// ➕ پیوستن به بازی
// ==========================================
bot.action(/^join_(\d+\.\d+)$/, (ctx) => {
    const gameId = parseFloat(ctx.match[1]);
    const userId = ctx.from.id;
    const game = games[gameId];

    if (!game) return ctx.reply('❌ این بازی وجود ندارد.');
    if (game.status !== 'waiting') return ctx.reply('❌ این بازی کامل شده است.');
    if (game.creator === userId) return ctx.reply('❌ شما سازنده بازی هستید و نمی‌توانید به بازی خود بپیوندید.');
    if (game.players.includes(userId)) return ctx.reply('❌ شما قبلاً در این بازی شرکت کرده‌اید.');

    getUser(userId, (user) => {
        if (user.diamonds < game.amount) {
            return ctx.reply(`❌ الماس کافی نیست! شما ${user.diamonds} الماس دارید.`);
        }

        updateUser(userId, { diamonds: user.diamonds - game.amount }, () => {
            game.players.push(userId);
            game.status = 'complete';

            ctx.replyWithPhoto(
                'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                {
                    caption: 
`Goal Challenge  

👤 شرکت‌کننده ۱: ${game.players[0]}  
👤 شرکت‌کننده ۲: ${game.players[1]}  

🔄 در حال انتخاب برنده...`
                }
            );

            setTimeout(() => {
                const winner = game.players[Math.floor(Math.random() * game.players.length)];
                const loser = game.players.find(p => p !== winner);

                getUser(winner, (winnerUser) => {
                    const winnerNewDiamonds = winnerUser.diamonds + game.prize;
                    updateUser(winner, { diamonds: winnerNewDiamonds }, () => {
                        getUser(loser, (loserUser) => {
                            ctx.replyWithPhoto(
                                'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                                {
                                    caption: 
`Goal Challenge  

🏅 برنده مسابقه: ${winner}  
❌ بازنده مسابقه: ${loser}`,
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: `🔵 جایزه برنده: ${game.prize}`, callback_data: 'dummy' }],
                                            [{ text: `🟢 موجودی برنده: ${winnerNewDiamonds}`, callback_data: 'dummy' }],
                                            [{ text: `🔴 موجودی بازنده: ${loserUser.diamonds}`, callback_data: 'dummy' }]
                                        ]
                                    }
                                }
                            );
                            delete games[gameId];
                        });
                    });
                });
            }, 2000);
        });
    });
});

// ==========================================
// ❌ لغو بازی
// ==========================================
bot.action(/^cancel_(\d+\.\d+)$/, (ctx) => {
    const gameId = parseFloat(ctx.match[1]);
    const userId = ctx.from.id;
    const game = games[gameId];

    if (!game) return ctx.reply('❌ این بازی وجود ندارد.');
    if (game.creator !== userId) return ctx.reply('❌ فقط سازنده بازی می‌تواند آن را لغو کند.');

    getUser(userId, (user) => {
        updateUser(userId, { diamonds: user.diamonds + game.amount }, () => {
            delete games[gameId];
            ctx.reply('❌ بازی لغو شد. الماس شما برگردانده شد.');
        });
    });
});

// ==========================================
// 🤖 بازی با ربات (سازنده ربات است)
// ==========================================
bot.hears(/^بازی (\d+) با ربات$/, (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1]);

    getUser(userId, (user) => {
        if (amount < 20) return ctx.reply('❌ حداقل ورود به بازی ۲۰ الماس است.');
        if (user.diamonds < amount) return ctx.reply(`❌ الماس کافی نیست! شما ${user.diamonds} الماس دارید.`);

        const gameId = Date.now() + Math.random();
        games[gameId] = {
            creator: 'bot',
            amount: amount,
            prize: amount * 2,
            players: ['bot'],
            status: 'waiting'
        };

        updateUser(userId, { diamonds: user.diamonds - amount }, () => {
            ctx.replyWithPhoto(
                'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                {
                    caption: 
`Goal Challenge  

💰 مقدار الماس: ${amount}  
🎁 جایزه برنده: ${amount * 2}  
🤖 سازنده: ربات Goal Challenge  

برای پیوستن به بازی، روی دکمه بزن.`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ پیوستن', callback_data: `join_bot_${gameId}` }],
                            [{ text: '❌ لغو بازی', callback_data: `cancel_bot_${gameId}` }]
                        ]
                    }
                }
            );
        });
    });
});

// ==========================================
// ➕ پیوستن به بازی با ربات
// ==========================================
bot.action(/^join_bot_(\d+\.\d+)$/, (ctx) => {
    const gameId = parseFloat(ctx.match[1]);
    const userId = ctx.from.id;
    const game = games[gameId];

    if (!game) return ctx.reply('❌ این بازی وجود ندارد.');
    if (game.status !== 'waiting') return ctx.reply('❌ این بازی کامل شده است.');
    if (game.players.includes(userId)) return ctx.reply('❌ شما قبلاً در این بازی شرکت کرده‌اید.');

    game.players.push(userId);
    game.status = 'complete';

    ctx.replyWithPhoto(
        'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
        {
            caption: 
`Goal Challenge  

👤 شرکت‌کننده ۱: ربات  
👤 شرکت‌کننده ۲: ${userId}  

🔄 در حال انتخاب برنده...`
        }
    );

    setTimeout(() => {
        const winner = game.players[Math.floor(Math.random() * game.players.length)];
        const loser = game.players.find(p => p !== winner);

        if (winner === 'bot') {
            ctx.replyWithPhoto(
                'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                {
                    caption: 
`Goal Challenge  

🏅 برنده مسابقه: ربات  
❌ بازنده مسابقه: ${loser}`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `🔵 جایزه برنده: ${game.prize}`, callback_data: 'dummy' }],
                            [{ text: `🟢 موجودی ربات: ${game.prize}`, callback_data: 'dummy' }],
                            [{ text: `🔴 موجودی بازنده: ${user.diamonds}`, callback_data: 'dummy' }]
                        ]
                    }
                }
            );
        } else {
            getUser(winner, (winnerUser) => {
                const winnerNewDiamonds = winnerUser.diamonds + game.prize;
                updateUser(winner, { diamonds: winnerNewDiamonds }, () => {
                    ctx.replyWithPhoto(
                        'https://uploadkon.ir/uploads/6f3701_26IMG-20260731-210215-709.jpg',
                        {
                            caption: 
`Goal Challenge  

🏅 برنده مسابقه: ${winner}  
❌ بازنده مسابقه: ربات`,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: `🔵 جایزه برنده: ${game.prize}`, callback_data: 'dummy' }],
                                    [{ text: `🟢 موجودی برنده: ${winnerNewDiamonds}`, callback_data: 'dummy' }],
                                    [{ text: `🔴 موجودی بازنده: ${game.prize}`, callback_data: 'dummy' }]
                                ]
                            }
                        }
                    );
                });
            });
        }
        delete games[gameId];
    }, 2000);
});