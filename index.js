"use strict";

require("dotenv").config();
const bot = require("./src/config/config.js");
const { readdirSync } = require("fs");
const { Collection } = require("discord.js");
const { connect } = require("mongoose");
const { DateTime, Interval } = require("luxon");
const { schedule } = require("node-cron");
const { ErrorMessage, InfoMessage, BotError } = require("./src/util/classes/classes.js");
const { adminRoleID, eventMakerRoleID, testerRoleID, sandboxRoleID } = require("./src/util/consts/consts.js");
const endEvent = require("./src/util/functions/endEvent.js");
const endChampionship = require("./src/util/functions/endChampionship.js");
const endOffer = require("./src/util/functions/endOffer.js");
const regenBM = require("./src/util/functions/regenBM.js");
const regenDealership = require("./src/util/functions/regenDealership.js");
const tracker = require("./src/util/functions/tracker.js");
const { takeSnapshot, distributePlacementRewards } = require("./src/util/functions/packBattleManager.js");
const serverStatModel = require("./src/models/serverStatSchema.js");
const profileModel = require("./src/models/profileSchema.js");
const championshipsModel = require("./src/models/championshipsSchema.js");
const eventModel = require("./src/models/eventSchema.js");
const offerModel = require("./src/models/offerSchema.js");
const packBattleModel = require("./src/models/packBattleSchema.js");
const prefix = bot.devMode ? process.env.DEV_PREFIX : process.env.BOT_PREFIX;
const token = bot.devMode ? process.env.DEV_TOKEN : process.env.BOT_TOKEN;
const commandFiles = readdirSync("./src/commands").filter(file => file.endsWith(".js"));

// ============================================================================
// INITIALIZE DATA MANAGER - Loads all cars, tracks, packs into memory ONCE
// ============================================================================
const dataManager = require("./src/util/functions/dataManager.js");
const dataStats = dataManager.initialize("./src");

// Exit if critical files failed to load
if (dataStats.cars.failed > 0) {
    console.error("❌ Some car files failed to load. Check errors above.");
    process.exit(1);
}

// 🔒 Global crash protection
process.on("unhandledRejection", (reason, promise) => {
    console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error);

    try {
        const errorReport = new BotError({
            stack: error.stack,
            unknownSource: true
        });
        errorReport.sendReport();
    } catch (_) {}
});

for (let commandFile of commandFiles) {
    let command = require(`./src/commands/${commandFile}`);
    bot.commands.set(command.name, command);
}

// Database connection (removed deprecated options for Mongoose 6+)
connect(process.env.MONGO_PW)
    .then(() => console.log("database connect successful!"))
    .catch(error => console.log(error));

bot.login(token);

// bot events
bot.once("ready", async () => {
    bot.devMode ? console.log("DevBote Ready!") : console.log("Bote Ready!");
    bot.awakenTime = DateTime.now();

    await bot.fetchHomeGuild();
    const members = await bot.homeGuild.members.fetch();
    members.forEach(async (user) => {
        await upsertUserRecord(user);
    });

    bot.devMode ? bot.user.setActivity("around with code", { type: "PLAYING" }) : bot.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

bot.on("messageCreate", async (message) => {
    processCommand(message);
});

bot.on("guildMemberAdd", async (member) => {
    if (!bot.devMode) {
        await upsertUserRecord(member);
    }
});

bot.on("messageUpdate", (oldMessage, newMessage) => {
    if (bot.awakenTime < oldMessage.createdTimestamp) {
        processCommand(newMessage);
    }
});

// loop thingy - checks for expired events/offers every 3 minutes
setInterval(async () => {
    // Fetch all active items in parallel (H-02: was 5 sequential queries, now 1 parallel batch)
    const [events, championships, offers, packBattles, playerDatum] = await Promise.all([
        eventModel.find({ isActive: true }).lean(),
        championshipsModel.find({ isActive: true }).lean(),
        offerModel.find({ isActive: true }).lean(),
        packBattleModel.find({ isActive: true }).lean(),
        profileModel.find(
            { "settings.senddailynotifs": true, "dailyStats.notifReceived": false },
            { userID: 1, dailyStats: 1 }  // H-02: projection — only fetch needed fields
        ).lean()
    ]);

    for (let event of events) {
        if (event.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline)).invalid !== null) {
            await endEvent(event);
        }
    }

    for (let championship of championships) {
        if (championship.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(championship.deadline)).invalid !== null) {
            await endChampionship(championship);
        }
    }

    for (let offer of offers) {
        if (offer.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline)).invalid !== null) {
            await endOffer(offer);
        }
    }

    // Auto-expire pack battles
    for (let battle of packBattles) {
        if (battle.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(battle.deadline)).invalid !== null) {
            try {
                await distributePlacementRewards(battle);
                await packBattleModel.deleteOne({ battleID: battle.battleID });
                console.log(`[PackBattle] Auto-expired and ended: ${battle.name}`);
            } catch (err) {
                console.error(`[PackBattle] Error auto-expiring ${battle.name}:`, err.message);
            }
        }
    }

    // L-06: Use member cache first, fall back to API fetch
    for (let { userID, dailyStats } of playerDatum) {
        let { lastDaily } = dailyStats;
        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(lastDaily).plus({ days: 1 }));
        if (interval.invalid !== null) {
            let user = bot.homeGuild.members.cache.get(userID) || await bot.homeGuild.members.fetch(userID)
                .catch(() => "unable to find user, next");

            if (typeof user !== "string") {
                await user.send("**Notification: Your daily reward is now available! Claim it using `cd-daily`.**")
                    .catch(() => console.log(`unable to send notification to user ${userID}`));
                await profileModel.updateOne({ userID }, {
                    "$set": {
                        "dailyStats.notifReceived": true
                    }
                });
            }
        }
    }

    // Flush tracking stats to DB every 3 minutes
    await tracker.flush();
}, 180000);

// Snapshot active pack battle leaderboards every 30 minutes
setInterval(async () => {
    try {
        // M-14: Exclude snapshots from fetch — we only need playerStats to build a new snapshot
        const activeBattles = await packBattleModel.find({ isActive: true }, { snapshots: 0 }).lean();
        for (const battle of activeBattles) {
            if (Object.keys(battle.playerStats || {}).length > 0) {
                await takeSnapshot(battle);
            }
        }
    } catch (err) {
        console.error("[PackBattle] Snapshot interval error:", err.message);
    }
}, 1800000);

schedule("0 */12 * * *", async () => {
    let { lastBMRefresh } = await serverStatModel.findOne({});
    try {
        await regenDealership();
        if (Interval.fromDateTimes(DateTime.fromISO(lastBMRefresh), DateTime.now()).length("hours") >= 11) {
            await regenBM();
        }
    }
    catch (error) {
        console.log(error.stack);
        const errorReport = new BotError({
            stack: error.stack,
            unknownSource: true
        });
        return errorReport.sendReport();
    }

    const playerDatum = await profileModel.find({ "settings.senddealnotifs": true });
    for (let { userID } of playerDatum) {
        let user = await bot.homeGuild.members.fetch(userID)
            .catch(() => "unable to find user, next");
        if (typeof user !== "string") {
            await user.send("**Notification: The dealership has refreshed!**")
                .catch(() => console.log(`unable to send notification to user ${userID}`));
        }
    }
});

async function processCommand(message) {
    if (message.webhookId !== null || !bot.homeGuild) return; //webhooks not allowed

    const member = bot.homeGuild.members.cache.get(message.author.id)
        || await bot.homeGuild.members.fetch(message.author.id)
            .catch(() => {
                if (message.content.toLowerCase().startsWith(prefix)) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, you are required to be in the Cloned Drives discord server to use this bot.",
                        desc: "Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
            });
    if (!message.content.toLowerCase().startsWith(prefix) || message.author.bot) return;
    // BUG FIX: Changed || to && - previously required BOTH roles, now requires EITHER
    if (bot.devMode && !member._roles.includes(adminRoleID) && !member._roles.includes(testerRoleID)) return;

    const args = message.content.slice(prefix.length).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = bot.commands.get(commandName) || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, 404 command not found.",
            desc: "It looks like this command doesn't exist. Try using \`cd-help\` to find the command you are looking for.",
            author: message.author
        }).displayClosest(commandName, commandFiles.map(i => i.slice(0, -3)));
        return errorMessage.sendMessage();
    }

    switch (command.category) {
        case "Admin":
            if (!member.roles.cache.has(adminRoleID)) {
                return accessDenied(message, adminRoleID);
            }
            break;
        case "Events":
            if (!member.roles.cache.has(eventMakerRoleID)) {
                return accessDenied(message, eventMakerRoleID);
            }
            break;
        case "Testing":
            if (!member.roles.cache.has(testerRoleID)) {
                return accessDenied(message, testerRoleID);
            }
           break;
        case "Sandbox":
            if (!member.roles.cache.has(sandboxRoleID)) {
                return accessDenied(message, sandboxRoleID);
            }
            break;
        default:
            break;
    }

    if (command.args > 0 && args.length < command.args) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, arguments provided insufficient.",
            desc: `Please refer to the command's syntax by running \`cd-help ${command.name}\``,
            author: message.author
        });
        return errorMessage.sendMessage();
    }
    if (!bot.cooldowns.has(command.name)) {
        bot.cooldowns.set(command.name, new Collection());
    }
    const now = Date.now();
    const timestamps = bot.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 1) * 1000;
    if (timestamps.has(message.author.id)) {
        const expTime = timestamps.get(message.author.id) + cooldownAmount;
        if (now < expTime) {
            const cooldownMessage = new InfoMessage({
                channel: message.channel,
                title: "You may not execute this command yet, there's a cooldown in place.",
                desc: `The cooldown is there to prevent spamming. Try again in \`${Math.round((expTime - now) / 1000)}\` second(s).`,
                author: message.author
            });
            return cooldownMessage.sendMessage();
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    if (!bot.execList[message.author.id]) {
        tracker.trackCommand(command.name, message.author.id);
        try {
            bot.execList[message.author.id] = command.name;
            await command.execute(message, args);
        }
        catch (error) {
            tracker.trackError();
            console.error(error.stack);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, failed to execute command.",
                desc: `Something must have gone wrong. Don't worry, I've already reported this issue to the devs.`,
                author: message.author
            });
            await errorMessage.sendMessage();

            const errorReport = new BotError({
                guild: message.guild,
                channel: message.channel,
                message,
                stack: error.stack,
            });
            return errorReport.sendReport();
        }
        finally {
            // BUG FIX: Always clean up execList, even if command throws
            delete bot.execList[message.author.id];
        }
    }
    else {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, you may only execute 1 command at a time.",
            desc: "This error will disappear once the currently executing command finishes or after 30 seconds, whichever comes first.",
            author: message.author,
            fields: [{ name: "Currently Executing", value: `\`${bot.execList[message.author.id]}\`` }]
        });
        return errorMessage.sendMessage({ preserve: true });
    }
}

async function upsertUserRecord(user) {
    let params = { userID: user.id };
    let hasProfile = await profileModel.exists(params);
    if (!hasProfile && !user.bot) {
        await profileModel.create(params);
        tracker.trackNewPlayer();
        console.log(`profile created for user ${user.id}`);
    }
}

function accessDenied(message, roleID) {
    const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error, it looks like you dont have access to this command.",
        desc: `You don't have the <@&${roleID}> role, which is required to use this command.`,
        author: message.author
    });
    return errorMessage.sendMessage();
}
