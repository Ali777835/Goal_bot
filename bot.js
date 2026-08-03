const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN || '7980096496:AAEza-CUFjxG-e6u2Y-NJkgJUK4i73dg3iY';
const ADMIN_ID = 7980096496;

const bot = new Telegraf(TOKEN);

// دیتابیس موقت در حافظه (برای کاربران و بازی‌ها)
const db = {
    users: {},
    activeGames: {}
};

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            diamonds: 100, // ۱۰۰ الماس رایگان برای اولین استارت
            pendingInput: '',
            expectingReceiptFor: null
        };
    }
    return db.users[userId];
}

function getMainMenu() {
    return Markup.keyboard([
        ['خرید الماس', 'حساب کاربری'],
        ['پشنهاد بازی', 'بازی']
    ]).resize();
}

// دستور استارت
bot.start(async (ctx) => {
    if (ctx.chat.type === 'private') {
        getUser(ctx.from.id);
        const welcomeText = `سلاااام کصکش عمو\nبه ربات بازی خوش آمدید\nدکمه های پایین رو لمس کن`;
        await ctx.reply(welcomeText, getMainMenu());
    } else {
        await ctx.reply(`سلاااام به جنده های گروه\nپچه های داخل شکم هاتون خوبن؟\nیک توضیح مختصر برای بازی هتون میدم اگر نفهمیدین به کیرم\nبازی بازی شرط بندی\nتو اگر میخوای با یکی بازی کنی مثال بنویس بازی 20\nاگر میخوای با من بازی کنی مثال بنویس بازی 20 با ربات\n\nهمین اگر نفهمیدی به کیرم`);
    }
});

// حساب کاربری
bot.hears('حساب کاربری', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = getUser(ctx.from.id);
    const text = `حساب کاربری\nآیدی عددی کاربر: ${ctx.from.id}\n\nتعداد الماس\nتعداد الماس های کاربر: ${user.diamonds}`;
    await ctx.reply(text, Markup.keyboard([['برگشت']]).resize());
});

bot.hears('برگشت', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('منوی اصلی:', getMainMenu());
});

// خرید الماس
bot.hears('خرید الماس', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = getUser(ctx.from.id);
    user.pendingInput = '';
    await ctx.reply(getBuyText(user.pendingInput), getBuyKeyboard());
});

function getBuyText(amount) {
    return `چقدر میخوای الماس بخری کصکش\nهر الماس معادل 100 تومن\nچقدر میخوای؟ ${amount}`;
}

function getBuyKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('1', 'num_1'), Markup.button.callback('2', 'num_2'), Markup.button.callback('3', 'num_3')],
        [Markup.button.callback('4', 'num_4'), Markup.button.callback('5', 'num_5'), Markup.button.callback('6', 'num_6')],
        [Markup.button.callback('7', 'num_7'), Markup.button.callback('8', 'num_8'), Markup.button.callback('9', 'num_9')],
        [Markup.button.callback('✓', 'num_done'), Markup.button.callback('0', 'num_0'), Markup.button.callback('×', 'num_back')]
    ]);
}

bot.action(/^num_(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const user = getUser(ctx.from.id);

    if (action === 'back') {
        user.pendingInput = user.pendingInput.slice(0, -1);
    } else if (action === 'done') {
        const amount = parseInt(user.pendingInput) || 0;
        if (amount <= 0) return ctx.answerCbQuery('مقدار نامعتبر است!');
        const totalCost = amount * 100;
        await ctx.editMessageText(`مقدار الماسی که میخوای ${amount} هست\nمقدار پولی که باید بدی ${totalCost} تومن هست\nپول کون دادن رو ارسال کن و منتظر تایید مدیر باش`, {
            reply_markup: Markup.inlineKeyboard([[Markup.button.callback('شماره کارت', 'show_card_' + amount)]]).reply_markup
        });
        return;
    } else {
        user.pendingInput += action;
    }

    try {
        await ctx.editMessageText(getBuyText(user.pendingInput), { reply_markup: getBuyKeyboard().reply_markup });
    } catch (e) {}
    await ctx.answerCbQuery();
});

bot.action(/^show_card_(\d+)$/, async (ctx) => {
    const amount = ctx.match[1];
    const totalCost = amount * 100;
    await ctx.editMessageText(`مبلغ ${totalCost} تومن\nمقدار ${amount}\nشماره کارت\n5029081054877861\nعلی جاهدی\nعکس پرداخت بفرست کصکش`);
    getUser(ctx.from.id).expectingReceiptFor = parseInt(amount);
});

// دریافت عکس فیش
bot.on('photo', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = getUser(ctx.from.id);
    if (!user.expectingReceiptFor) return;

    const amount = user.expectingReceiptFor;
    user.expectingReceiptFor = null;

    await ctx.reply('تا تو یک بار دیگه کون بدی مدیر هم تایید میکنه یا رد میکنه');

    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    await bot.telegram.sendPhoto(ADMIN_ID, photoId, {
        caption: `ریز عکس\nیک کیری کله پول جندگی رو داده الماس خریده قبول میکنی یا کونش بزارم ؟\nکاربر: ${ctx.from.id}\nمقدار الماس: ${amount}`,
        ...Markup.inlineKeyboard([
            [Markup.button.callback('قبوله', 'admin_accept'), Markup.button.callback('بگاش', 'admin_reject')]
        ])
    });
});

bot.action('admin_accept', async (ctx) => {
    const caption = ctx.callbackQuery.message.caption;
    const userIdMatch = caption.match(/کاربر: (\d+)/);
    const amountMatch = caption.match(/مقدار الماس: (\d+)/);

    if (userIdMatch && amountMatch) {
        const userId = userIdMatch[1];
        const amount = parseInt(amountMatch[1]);
        getUser(userId).diamonds += amount;
        await bot.telegram.sendMessage(userId, 'آفرین اگر فیک بود که کونت میزاشتم');
        await ctx.editMessageCaption('تایید شد و الماس اضافه گردید.');
    }
});

bot.action('admin_reject', async (ctx) => {
    const caption = ctx.callbackQuery.message.caption;
    const userIdMatch = caption.match(/کاربر: (\d+)/);
    if (userIdMatch) {
        const userId = userIdMatch[1];
        await bot.telegram.sendMessage(userId, 'چرب کن که دارم میام کصکش رسید فیک میدی');
        await ctx.editMessageCaption('رد شد.');
    }
});

// پیشنهاد بازی
const userState = {};
bot.hears('پشنهاد بازی', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    userState[ctx.from.id] = 'awaiting_game_proposal';
    await ctx.reply('بازی پیشنهادی تو بگو کصکش ببینم');
});

bot.on('text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    const userId = ctx.from.id;
    if (userState[userId] === 'awaiting_game_proposal') {
        userState[userId] = null;
        await ctx.reply('برو تا آب کصت در بیاد نتیجه برات ارسال میشه');
        await bot.telegram.sendMessage(ADMIN_ID, `متن توضیح\nاین بازی پیشنهادی یکی از جنده ها هست قبول میکنی یا نه\nپيشنهاد دهنده: ${userId}\nتوضیح: ${ctx.message.text}`, {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('تاییده', 'prop_accept'), Markup.button.callback('رد کن', 'prop_reject')]
            ]).reply_markup
        });
        return;
    }
    return next();
});

bot.action('prop_accept', async (ctx) => {
    const caption = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption;
    const userIdMatch = caption.match(/پيشنهاد دهنده: (\d+)/);
    if (userIdMatch) {
        await bot.telegram.sendMessage(userIdMatch[1], 'بازی پیشنهادی تایید کن الحق که جنده خوبی هستی');
        await ctx.editMessageText('تایید شد.');
    }
});

bot.action('prop_reject', async (ctx) => {
    const caption = ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption;
    const userIdMatch = caption.match(/پيشنهاد دهنده: (\d+)/);
    if (userIdMatch) {
        await bot.telegram.sendMessage(userIdMatch[1], 'کیرم تو کونت با این بازی پیشنهاد دادنت کصکش');
        await ctx.editMessageText('رد شد.');
    }
});

// دکمه بازی در پی‌وی
bot.hears('بازی', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('بازی بازی کردن باید منو داخل گروهت مدیر کنی و کلمه /start بزن تا فعال شم داخل گروه', Markup.inlineKeyboard([
        [Markup.button.url('افزودن به گروه', `https://t.me/${ctx.botInfo.username}?startgroup=true`)]
    ]));
});

// موجودی در گروه
bot.hears(/^موجودی$/, async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const user = getUser(ctx.from.id);
    await ctx.reply(`الماس های شما\nموجودی شما: ${user.diamonds}`);
});

// ساخت بازی در گروه
bot.hears(/^بازی (\d+)( گپ| با ربات)?$/, async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const bet = parseInt(ctx.match[1]);
    const isWithBot = ctx.match[2] && ctx.match[2].includes('با ربات');
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (user.diamonds < bet) {
        return ctx.reply(`موجودی نداری کصکش\nموجودی: ${user.diamonds}`);
    }

    if (isWithBot) {
        user.diamonds -= bet;
        const prize = bet * 2;
        const msg = await ctx.reply(`${ctx.chat.title}\n\nجنده اول\nآیدی ربات\n\nجایزه بهترین کون\nدو برابر بازی ساخته شده مثال ${bet} هست برای ورود جایزه باشع ${prize}\n\nبرای ورود به بازی دکمه پیوستن بزن`, Markup.inlineKeyboard([
            [Markup.button.callback('پیوستن', 'join_bot_game')]
        ]));
        db.activeGames[msg.message_id] = { creatorId: userId, bet, type: 'bot' };
    } else {
        user.diamonds -= bet;
        const prize = bet * 2;
        const msg = await ctx.reply(`${ctx.chat.title}\n\nجنده اول\nآیدی کاربر سازنده: ${userId}\n\nجایزه بهترین کون\nدو برابر بازی ساخته شده مثال ${bet} هست برای ورود جایزه باشع ${prize}\n\nبرای ورود به بازی دکمه پیوستن بزن`, Markup.inlineKeyboard([
            [Markup.button.callback('لغو', 'cancel_game'), Markup.button.callback('پیوستن', 'join_group_game')]
        ]));
        db.activeGames[msg.message_id] = { creatorId: userId, bet, type: 'group', secondUser: null };
    }
});

bot.action('cancel_game', async (ctx) => {
    const game = db.activeGames[ctx.callbackQuery.message.message_id];
    if (game && ctx.from.id === game.creatorId) {
        getUser(game.creatorId).diamonds += game.bet;
        delete db.activeGames[ctx.callbackQuery.message.message_id];
        await ctx.editMessageText('بازی لغو کرد کصکش جنده کونی');
    } else {
        await ctx.answerCbQuery('فقط سازنده بازی می‌تواند لغو کند!');
    }
});

bot.action('join_group_game', async (ctx) => {
    const gameId = ctx.callbackQuery.message.message_id;
    const game = db.activeGames[gameId];
    if (!game) return ctx.answerCbQuery('بازی یافت نشد یا تمام شده است.');

    if (ctx.from.id === game.creatorId) {
        return ctx.answerCbQuery('شما سازنده بازی هستید!');
    }

    const user = getUser(ctx.from.id);
    if (user.diamonds < game.bet) {
        return ctx.answerCbQuery('الماس نداری کصکش', { show_alert: true });
    }

    user.diamonds -= game.bet;
    game.secondUser = ctx.from.id;

    await ctx.editMessageText(`${ctx.chat.title}\n\nجنده اول\nآیدی کاربر سازنده: ${game.creatorId}\n\nجنده دوم\nآیدی کاربر: ${ctx.from.id}\n\nدر حال انتخاب بهترین کون`);

    setTimeout(async () => {
        const winnerId = Math.random() < 0.5 ? game.creatorId : game.secondUser;
        const loserId = winnerId === game.creatorId ? game.secondUser : game.creatorId;
        getUser(winnerId).diamonds += game.bet * 2;

        await bot.telegram.editMessageText(ctx.chat.id, gameId, undefined, `${ctx.chat.title}\n\nبهترین کون\nآیدی برنده: ${winnerId}\n\nبدترین کون\nآیدی کاربر بازنده: ${loserId}\n\nجایزه بهترین کون\nدو برار بازی ساخته شده`, Markup.inlineKeyboard([
            [Markup.button.callback(`بهترین کون ${getUser(winnerId).diamonds}`, 'noop'), Markup.button.callback(`بدترین کون ${getUser(loserId).diamonds}`, 'noop')]
        ]));
        delete db.activeGames[gameId];
    }, 3000);
});

bot.action('join_bot_game', async (ctx) => {
    const gameId = ctx.callbackQuery.message.message_id;
    const game = db.activeGames[gameId];
    if (!game) return ctx.answerCbQuery('بازی یافت نشد.');

    const userId = ctx.from.id;
    const user = getUser(userId);

    await ctx.editMessageText(`${ctx.chat.title}\n\nجنده اول\nآیدی ربات\n\nجنده دوم\nآیدی کاربر: ${userId}\n\nدر حال انتخاب بهترین کون`);

    setTimeout(async () => {
        const botWins = Math.random() < 0.5;
        let winnerText, loserText, winnerDiamondDisplay, loserDiamondDisplay;

        if (botWins) {
            winnerText = 'آیدی ربات';
            loserText = userId;
            winnerDiamondDisplay = '∞';
            loserDiamondDisplay = user.diamonds;
        } else {
            user.diamonds += game.bet * 2;
            winnerText = userId;
            loserText = 'آیدی ربات';
            winnerDiamondDisplay = user.diamonds;
            loserDiamondDisplay = '∞';
        }

        await bot.telegram.editMessageText(ctx.chat.id, gameId, undefined, `${ctx.chat.title}\n\nبهترین کون\n${winnerText}\n\nبدترین کون\n${loserText}\n\nجایزه بهترین کون\nدو برار بازی ساخته شده`, Markup.inlineKeyboard([
            [Markup.button.callback(`بهترین کون ${winnerDiamondDisplay}`, 'noop'), Markup.button.callback(`بدترین کون ${loserDiamondDisplay}`, 'noop')]
        ]));
        delete db.activeGames[gameId];
    }, 3000);
});

// انتقال الماس با ریپلای
bot.hears(/^انتقال (\d+)$/, async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!ctx.message.reply_to_message) {
        return ctx.reply('باید روی پیام کاربر مورد نظر ریپلای کنی!');
    }

    const amount = parseInt(ctx.match[1]);
    const senderId = ctx.from.id;
    const receiverId = ctx.message.reply_to_message.from.id;

    if (senderId === receiverId) {
        return ctx.reply('نمیتونی به خودت الماس انتقال بدی!');
    }

    const sender = getUser(senderId);
    if (sender.diamonds < amount) {
        return ctx.reply('خودت الماس نداری کصکش میخوای بدی به یکی دیگه');
    }

    const receiver = getUser(receiverId);
    sender.diamonds -= amount;
    receiver.diamonds += amount;

    await ctx.reply(`انتقال الماس\n\nمقدار الماس انتقال شده\n${amount}\n\nجنده فرستنده\nآیدی: ${senderId}\n\nجنده گیرنده\nآیدی: ${receiverId}`, Markup.inlineKeyboard([
        [Markup.button.callback(`موجودی فرستنده: ${sender.diamonds}`, 'noop'), Markup.button.callback(`موجودی گیرنده: ${receiver.diamonds}`, 'noop')]
    ]));
});

// گزارش هر ۵ دقیقه
setInterval(async () => {
    try {
        await bot.telegram.sendMessage(ADMIN_ID, 'ربات روشن است و به کار خود ادامه می‌دهد.');
    } catch (e) {}
}, 5 * 60 * 1000);

bot.launch();
console.log('Bot is running...');
