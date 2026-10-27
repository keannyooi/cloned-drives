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
const endPvpEvent = require("./src/util/functions/endPvpEvent.js");
const regenBM = require("./src/util/functions/regenBM.js");
const regenDealership = require("./src/util/functions/regenDealership.js");
const { checkAutoEvents } = require("./src/util/functions/autoEvents.js");
const { checkRaceWeekRollover } = require("./src/util/functions/raceWeekManager.js");
const { handleSelfRoleInteraction } = require("./src/util/functions/handleSelfRole.js");
const { runSubmissionSweep, sweepDrafts, sweepSuggestions } = require("./src/util/functions/submissionSweep.js");

/**
 * The weekly rollover resets EVERY player's week, so a devMode bot — which
 * shares the production database — must not run it by accident. Set
 * RACEWEEK_DEV_ROLLOVER=true in .env to deliberately test it on dev; the
 * announcement is printed to the console there instead of the live channel.
 */
function allowRaceWeekRollover() {
    return !bot.devMode || process.env.RACEWEEK_DEV_ROLLOVER === "true";
}
const tracker = require("./src/util/functions/tracker.js");
const { takeSnapshot, startScheduledPackBattles, expirePackBattle } = require("./src/util/functions/packBattleManager.js");
const serverStatModel = require("./src/models/serverStatSchema.js");
const profileModel = require("./src/models/profileSchema.js");
const championshipsModel = require("./src/models/championshipsSchema.js");
const eventModel = require("./src/models/eventSchema.js");
const offerModel = require("./src/models/offerSchema.js");
const packBattleModel = require("./src/models/packBattleSchema.js");
const pvpEventModel = require("./src/models/pvpEventSchema.js");
const prefix = bot.devMode ? process.env.DEV_PREFIX : process.env.BOT_PREFIX;
const token = bot.devMode ? process.env.DEV_TOKEN : process.env.BOT_TOKEN;
const commandFiles = readdirSync("./src/commands").filter(file => file.endsWith(".js"));

// ============================================================================
// INITIALIZE DATA MANAGER - Loads all cars, tracks, packs into memory ONCE
// ============================================================================
const dataManager = require("./src/util/functions/dataManager.js");
const { startImageLinkRefresh } = require("./src/util/functions/discordImageLinks.js");
const dataStats = dataManager.initialize("./src");
// Pace Index — per-car strength table from the race formula (docs/pace-index.md).
// Pure function of the loaded cars/tracks; rebuilt on every start.
const paceSummary = require("./src/util/functions/paceIndex.js").computePaceIndex();
// Sandbox track pool for cd-testrace (src/rrtest, v2 format). Separate map: Random Race, events, PI and PvP never see it.
const testTracks = require("./src/util/functions/testTracks.js");
testTracks.load("./src");
testTracks.logSummary();
console.log(`   Pace Index: ${paceSummary.cars} cars x ${paceSummary.tracks} tracks in ${paceSummary.ms}ms`);

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

// ── Gateway health ───────────────────────────────────────────────────────────
// 2026-08-27 outage post-mortem: a 20-minute host network loss killed the
// gateway WebSocket. When the network returned, mongoose reconnected silently
// but the gateway never did — the bot sat "alive" (timers running, CPU moving)
// yet offline to players for over an hour, printing NOTHING, because none of
// these events had handlers. Log every lifecycle transition so a dead gateway
// is visible in the console instead of silent.
bot.on("shardDisconnect", (event, id) => console.error(`[gateway] shard ${id} DISCONNECTED (code ${event?.code}) — discord.js should reconnect; watchdog will force a reconnect if it does not`));
bot.on("shardReconnecting", id => console.log(`[gateway] shard ${id} reconnecting...`));
bot.on("shardResume", (id, replayed) => console.log(`[gateway] shard ${id} resumed (${replayed} events replayed)`));
bot.on("shardError", (error, id) => console.error(`[gateway] shard ${id} error: ${error.message}`));
bot.on("error", error => console.error(`[gateway] client error: ${error.message}`));
bot.on("warn", info => console.log(`[gateway] warn: ${info}`));

// Session invalidated = discord.js stops and will NEVER reconnect (documented
// behavior). Staying up in that state is a guaranteed zombie — exit so the
// panel's crash detection restarts us into a fresh session.
bot.on("invalidated", () => {
    console.error("[gateway] session INVALIDATED — client will not reconnect. Exiting for a clean restart.");
    process.exit(1);
});

// Zombie watchdog: catches a process that is alive with a dead gateway.
// Armed only after the first successful ready, so a slow boot is never touched.
//
// 2026-10-26 post-mortem: the old version judged health by dispatch traffic
// ("15 minutes of silence = dead") and by isReady(). Both were wrong:
// - isReady() never goes false after the first ready (discord.js 14.27 only
//   sets the manager status once), so it can't see a dead gateway at all.
// - The bot has no presence/typing intents, so a quiet chat means zero
//   dispatches. A healthy connection was killed after 17 quiet minutes, and
//   PebbleHost did NOT restart the exited process: the bot stayed offline.
//
// The honest signal is the heartbeat: Discord ACKs one every ~41s whether or
// not anyone is talking, and discord.js records when the last ACKed beat was
// sent (shard.lastPingTimestamp). Stale beats = dead link. Recovery is
// in-process and retried forever — never exit, because nothing restarts us
// (a long host network outage would otherwise strand the bot offline).
const HEARTBEAT_STALE_MS = 3 * 60000;       // ~4 missed beats
const FIRST_RECONNECT_TICK = 2;             // unhealthy ticks (~minutes) before the first reconnect
const RECONNECT_EVERY_TICKS = 5;            // then retry this often until heartbeats return
let gatewayDownMinutes = 0;
let watchdogArmed = false;
let watchdogReconnecting = false;

function heartbeatAgeMs() {
    // Oldest shard wins. -1 means the shard has never been ACKed since it was created.
    let oldest = 0;
    for (const shard of bot.ws.shards.values()) {
        const age = shard.lastPingTimestamp > 0 ? Date.now() - shard.lastPingTimestamp : Infinity;
        oldest = Math.max(oldest, age);
    }
    return oldest;
}

// Tear down every shard and connect fresh ones (new IDENTIFY). Goes through the
// @discordjs/ws manager discord.js keeps at ws._ws: its events are attached at
// the manager level, so new shards report into the same client. Client.destroy()
// + login() is NOT used: in 14.x the destroyed flag never resets and isReady()
// would stay false forever.
async function reconnectGateway(reason) {
    const wsManager = bot.ws._ws;
    if (!wsManager) throw new Error("no internal ws manager");
    const withTimeout = (promise, ms, label) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
    ]);
    await withTimeout(wsManager.destroy({ code: 1000, reason }), 60000, "destroy").catch(error => console.error(`[gateway] watchdog: destroy failed (${error.message}), connecting anyway`));
    await withTimeout(wsManager.connect(), 120000, "connect");
}

setInterval(async () => {
    if (!watchdogArmed || watchdogReconnecting) return;
    const ageMs = heartbeatAgeMs();
    const ageText = Number.isFinite(ageMs) ? `${Math.round(ageMs / 1000)}s ago` : "never";
    if (ageMs < HEARTBEAT_STALE_MS) {
        if (gatewayDownMinutes > 0) console.log(`[gateway] watchdog: heartbeat healthy again after ~${gatewayDownMinutes} unhealthy minute(s)`);
        gatewayDownMinutes = 0;
        return;
    }
    gatewayDownMinutes++;
    console.error(`[gateway] watchdog: unhealthy for ${gatewayDownMinutes} minute(s) (last heartbeat ACK ${ageText}, ping ${bot.ws.ping}ms)`);

    const sinceFirst = gatewayDownMinutes - FIRST_RECONNECT_TICK;
    if (sinceFirst < 0 || sinceFirst % RECONNECT_EVERY_TICKS !== 0) return;
    const attempt = sinceFirst / RECONNECT_EVERY_TICKS + 1;
    console.error(`[gateway] watchdog: reconnecting in-process (attempt ${attempt})...`);
    watchdogReconnecting = true;
    try {
        await reconnectGateway("Watchdog: heartbeat stale");
        console.log(`[gateway] watchdog: reconnect attempt ${attempt} completed, waiting for heartbeats`);
    } catch (error) {
        console.error(`[gateway] watchdog: reconnect attempt ${attempt} failed: ${error.message} — retrying in ${RECONNECT_EVERY_TICKS} minutes`);
    } finally {
        watchdogReconnecting = false;
    }
}, 60000);

// bot events
bot.once("clientReady", async () => {
    bot.devMode ? console.log("DevBote Ready!") : console.log("Bote Ready!");
    bot.awakenTime = DateTime.now();
    watchdogArmed = true;

    await bot.fetchHomeGuild();

    // Art hosted as Discord message links resolves to a signed URL that expires
    // in ~24h, so it is refreshed here and every 12h after. Needs the gateway up.
    startImageLinkRefresh();
    // Car submissions: the draft clock (reminders, auto-send) and the "in the
    // game" check for approved cars that now load. Scoped by isDev, so the dev
    // bot only touches its own records. Repeats daily at 12:00 UTC below.
    runSubmissionSweep().catch(error => console.log(`[Submissions] startup sweep failed: ${error.message}`));
    // devMode shares the production DB — a dev bot must never run (or announce)
    // the live Monday rollover. Test rollovers manually instead.
    if (allowRaceWeekRollover()) checkRaceWeekRollover().catch(error => console.log(`[RaceWeek] startup check failed: ${error.message}`));
    // A pack battle scheduled while the bot was down starts now (same gate).
    if (allowRaceWeekRollover()) startScheduledPackBattles().catch(error => console.log(`[PackBattle] startup schedule check failed: ${error.message}`));
    const members = await bot.homeGuild.members.fetch();
    // Not awaited, as before: the activity is set without waiting on the DB.
    seedKnownProfiles(members).catch(error => console.log(`[profiles] startup seed failed: ${error.message}`));

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

// Persistent component buttons (the #auto-assign-roles panel). Every other
// button in the bot runs on a per-message collector; these have to survive
// restarts, so they route through here instead.
bot.on("interactionCreate", async (interaction) => {
    try {
        await handleSelfRoleInteraction(interaction);
    }
    catch (error) {
        console.log(`[interactionCreate] unhandled: ${error.stack}`);
    }
});

bot.on("messageUpdate", (oldMessage, newMessage) => {
    if (bot.awakenTime < oldMessage.createdTimestamp) {
        processCommand(newMessage);
    }
});

function isPastDeadline(item) {
    return item.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(item.deadline)).invalid !== null;
}

// The tick finds { _id, deadline } stubs; this reloads the expired ones in full
// (same filter and lean shape the tick used to fetch). By _id, because eventIDs
// have collided before. A stub ended elsewhere in the meantime (the dev bot
// runs this loop on the same database) comes back null and is skipped.
async function loadExpired(model, stubs) {
    const expired = stubs.filter(isPastDeadline);
    if (expired.length === 0) return [];
    const docs = await Promise.all(expired.map(stub => model.findOne({ _id: stub._id, isActive: true }).lean()));
    return docs.filter(Boolean);
}

// loop thingy - checks for expired events/offers every 3 minutes
setInterval(async () => {
    // Race Week rollover check — idempotent, fire-and-forget (never in devMode:
    // shared prod DB, see the ready-hook note)
    if (allowRaceWeekRollover()) checkRaceWeekRollover().catch(error => console.log(`[RaceWeek] rollover check failed: ${error.message}`));
    // Scheduled pack battle starts (cd-startpackbattle <name> raceweek) — same
    // gate and same tick as the rollover, so "with Race Week" means with it.
    if (allowRaceWeekRollover()) await startScheduledPackBattles().catch(error => console.log(`[PackBattle] schedule check failed: ${error.message}`));

    // Fetch all active items in parallel (H-02: was 5 sequential queries, now 1 parallel batch).
    // Only the deadline is fetched for each: the full documents (rosters,
    // playerProgress, PvP entries, battle snapshots + playerStats) were pulled
    // ~480 times a day just to compare a date. The rare item that has expired
    // is reloaded in full by loadExpired, so the end handlers get the same lean
    // document as before.
    const [events, championships, offers, packBattles, pvpEvents, playerDatum] = await Promise.all([
        eventModel.find({ isActive: true }, { deadline: 1 }).lean(),
        championshipsModel.find({ isActive: true }, { deadline: 1 }).lean(),
        offerModel.find({ isActive: true }, { deadline: 1 }).lean(),
        packBattleModel.find({ isActive: true }, { deadline: 1 }).lean(),
        pvpEventModel.find({ isActive: true }, { deadline: 1 }).lean(),
        profileModel.find(
            { "settings.senddailynotifs": true, "dailyStats.notifReceived": false },
            { userID: 1, dailyStats: 1 }  // H-02: projection — only fetch needed fields
        ).lean()
    ]);

    for (let event of await loadExpired(eventModel, events)) {
        await endEvent(event);
    }

    for (let championship of await loadExpired(championshipsModel, championships)) {
        await endChampionship(championship);
    }

    for (let offer of await loadExpired(offerModel, offers)) {
        await endOffer(offer);
    }

    // Auto-expire pack battles
    for (let battle of await loadExpired(packBattleModel, packBattles)) {
        try {
            // Claims the battle first (the dev bot runs this loop on the same
            // database), then pays placements, archives and deletes it.
            if (await expirePackBattle(battle)) console.log(`[PackBattle] Auto-expired and ended: ${battle.name}`);
        } catch (err) {
            console.error(`[PackBattle] Error auto-expiring ${battle.name}:`, err.message);
        }
    }

    // Auto-expire PvP events — endPvpEvent() handles leaderboard archival + reward distribution
    for (let pvpEvent of await loadExpired(pvpEventModel, pvpEvents)) {
        try {
            await endPvpEvent(pvpEvent);
            console.log(`[PvP] Auto-expired and ended: ${pvpEvent.name}`);
        } catch (err) {
            console.error(`[PvP] Error auto-expiring ${pvpEvent.name}:`, err.message);
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

// Auto-events — daily check spawns any template (src/autoevents/) whose
// cadence or spawn day is due. Proving Grounds and friends live here.
schedule("0 0 * * *", async () => {
    await checkAutoEvents();
});

// The draft clock for car submissions — reminder at 14 days, auto-send at 30
// (consts). Midday UTC so the DMs land at a civil hour on both sides of the
// Atlantic. Idempotent, so the startup run above and this never double up.
schedule("0 12 * * *", async () => {
    await sweepDrafts().catch(error => console.log(`[Submissions] daily sweep failed: ${error.message}`));
    await sweepSuggestions();
});

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

    // Projected: only the ID is needed, and an unprojected find here dragged
    // every opted-in player's full garage over the throttled DB link twice a day.
    const playerDatum = await profileModel.find({ "settings.senddealnotifs": true }, { userID: 1 }).lean();
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

// Users known to have a profile — once confirmed, the per-command existence
// query (a full DB round trip, ~180ms to the remote cluster) is skipped for
// the life of the process. Profiles are never deleted while the bot runs, so
// a positive answer can't go stale.
const knownProfiles = new Set();

async function upsertUserRecord(user) {
    if (knownProfiles.has(user.id)) return;
    let params = { userID: user.id };
    let hasProfile = await profileModel.exists(params);
    if (!hasProfile && !user.bot) {
        await profileModel.create(params);
        tracker.trackNewPlayer();
        console.log(`profile created for user ${user.id}`);
        hasProfile = true;
    }
    if (hasProfile) knownProfiles.add(user.id);
}

// Startup: one distinct() over the userID index seeds knownProfiles, instead of
// one exists() per guild member (~835 at once, queued ahead of the first
// commands after a restart). Only members with no profile yet go through
// upsertUserRecord, one at a time — normally just whoever joined while the bot
// was down.
async function seedKnownProfiles(members) {
    const existing = await profileModel.distinct("userID");
    for (const userID of existing) knownProfiles.add(userID);
    for (const member of members.values()) {
        if (knownProfiles.has(member.id)) continue;
        await upsertUserRecord(member).catch(error => console.log(`[profiles] could not create a profile for ${member.id}: ${error.message}`));
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
