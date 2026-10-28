"use strict";

require("dotenv").config();
const bot = require("./src/config/config.js");
const { readdirSync } = require("fs");
const { Collection, ActivityType, Routes, RESTJSONErrorCodes } = require("discord.js");
const { connect, connection } = require("mongoose");
const { DateTime, Interval } = require("luxon");
const { schedule } = require("node-cron");
const { ErrorMessage, InfoMessage, BotError, runWithCommandLock } = require("./src/util/classes/classes.js");
const { knownProfiles } = require("./src/util/functions/profileCache.js");
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

// ── Background errors ────────────────────────────────────────────────────────
// Ticks, cron jobs and fire-and-forget promises have no command to report
// through, and node-cron 3 swallows a rejected job without even a console line.
// These send them to #bug-reports as well as the console. unknownSource reports
// ping the owner, so a DB outage failing every job every 3 minutes is capped:
// one report per job + error per 30 minutes, and at most 5 reports per 10.
const BACKGROUND_REPORT_EVERY_MS = 30 * 60000;
const BACKGROUND_REPORT_WINDOW_MS = 10 * 60000;
const BACKGROUND_REPORTS_PER_WINDOW = 5;
const backgroundReportedAt = new Map();    // "job: first error line" -> { at, suppressed }
let backgroundWindow = { start: 0, sent: 0 };

function reportBackgroundError(name, error) {
    const stack = String(error?.stack ?? error ?? "No stack trace.");
    const key = `${name}: ${stack.split("\n")[0].slice(0, 200)}`;
    const now = Date.now();
    const last = backgroundReportedAt.get(key);
    if (last && now - last.at < BACKGROUND_REPORT_EVERY_MS) {
        last.suppressed++;
        return;
    }
    if (now - backgroundWindow.start >= BACKGROUND_REPORT_WINDOW_MS) backgroundWindow = { start: now, sent: 0 };
    if (backgroundWindow.sent >= BACKGROUND_REPORTS_PER_WINDOW) return;
    backgroundWindow.sent++;
    for (const [oldKey, entry] of backgroundReportedAt) {
        if (now - entry.at >= BACKGROUND_REPORT_EVERY_MS) backgroundReportedAt.delete(oldKey);
    }
    const repeats = last?.suppressed ? ` (seen ${last.suppressed} more time(s) since the last report)` : "";
    backgroundReportedAt.set(key, { at: now, suppressed: 0 });
    new BotError({ stack: `[${name}]${repeats}\n${stack}`, unknownSource: true }).sendReport();
}

// Runs one background job: a throw is logged and reported, never passed on, so
// one failing job can't take the rest of a tick down with it. Resolves to the
// job's result, or undefined if it failed.
async function runJob(name, fn) {
    try {
        return await fn();
    }
    catch (error) {
        console.error(`[${name}] failed:`, error?.stack ?? error);
        reportBackgroundError(name, error);
        return undefined;
    }
}

// 🔒 Global crash protection
process.on("unhandledRejection", (reason, promise) => {
    console.error("UNHANDLED REJECTION:", reason);
    reportBackgroundError("unhandledRejection", reason);
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

// ── Startup ──────────────────────────────────────────────────────────────────
// Nothing restarts this process (PebbleHost doesn't), so a start during an
// Atlas blip or a host network outage must not give up: each step is retried
// with backoff until it works, logging every failure. The database comes first
// so the bot never shows online with no DB behind it.
const STARTUP_RETRY_FIRST_MS = 5000;
const STARTUP_RETRY_MAX_MS = 5 * 60000;

async function retryForever(label, fn) {
    let delay = STARTUP_RETRY_FIRST_MS;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            console.error(`[startup] ${label} failed (attempt ${attempt}): ${error?.message ?? error} — retrying in ${Math.round(delay / 1000)}s`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, STARTUP_RETRY_MAX_MS);
        }
    }
}

// After the first connect the driver reconnects on its own; these just make
// the DB side of an outage visible in the console.
connection.on("disconnected", () => console.error("[database] DISCONNECTED — the driver will keep reconnecting"));
connection.on("reconnected", () => console.log("[database] reconnected"));
connection.on("error", error => console.error(`[database] error: ${error.message}`));

async function startBot() {
    await retryForever("database connect", () => connect(process.env.MONGO_PW));
    console.log("database connect successful!");

    // login() destroys the client when its connect fails, so it isn't looped
    // blindly: the gateway lookup it makes first is retried on its own until
    // Discord answers, then login runs. Only a network drop inside that short
    // window lands in the second retry.
    bot.rest.setToken(token);
    await retryForever("Discord gateway lookup", () => bot.rest.get(Routes.gatewayBot()));
    await retryForever("Discord login", () => bot.login(token));
}
startBot();

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

    // Every command, tick and report needs the home guild; without it the bot
    // looks online and ignores everyone, so keep trying.
    await retryForever("home guild fetch", () => bot.fetchHomeGuild());

    // Art hosted as Discord message links resolves to a signed URL that expires
    // in ~24h, so it is refreshed here and every 12h after. Needs the gateway up.
    startImageLinkRefresh();
    // Car submissions: the draft clock (reminders, auto-send) and the "in the
    // game" check for approved cars that now load. Scoped by isDev, so the dev
    // bot only touches its own records. Repeats daily at 12:00 UTC below.
    runJob("Submissions startup sweep", runSubmissionSweep);
    // devMode shares the production DB — a dev bot must never run (or announce)
    // the live Monday rollover. Test rollovers manually instead.
    if (allowRaceWeekRollover()) runJob("RaceWeek startup check", checkRaceWeekRollover);
    // A pack battle scheduled while the bot was down starts now (same gate).
    if (allowRaceWeekRollover()) runJob("PackBattle startup schedule check", startScheduledPackBattles);
    // Fills the member cache (the DM loops and processCommand read it first).
    // If it fails, profiles are still created on demand by processCommand.
    const members = await bot.homeGuild.members.fetch()
        .catch(error => console.error(`[startup] member prefetch failed: ${error.message} — skipping the profile seed`));
    // Not awaited, as before: the activity is set without waiting on the DB.
    if (members) seedKnownProfiles(members).catch(error => console.log(`[profiles] startup seed failed: ${error.message}`));

    setBotActivity();
});

// v14 sends `type` to the gateway as-is, which wants the numeric enum.
function setBotActivity() {
    bot.devMode ? bot.user.setActivity("around with code", { type: ActivityType.Playing }) : bot.user.setActivity("over everyone's garages", { type: ActivityType.Watching });
}

// A fresh IDENTIFY (the watchdog's in-process reconnect, or discord.js after a
// failed resume) starts with no activity and clientReady doesn't fire again,
// so set it again whenever a shard comes up. A resume keeps it on its own.
bot.on("shardReady", () => {
    if (bot.user) setBotActivity();
});

bot.on("messageCreate", async (message) => {
    processCommand(message).catch(reportDispatchError);
});

// A throw before processCommand's own try (the command error path reports there).
function reportDispatchError(error) {
    console.error("[processCommand] failed before the command ran:", error?.stack ?? error);
    reportBackgroundError("processCommand", error);
}

bot.on("guildMemberAdd", async (member) => {
    if (!bot.devMode) {
        // A failure here is recovered by processCommand's on-demand create.
        await upsertUserRecord(member).catch(error => console.log(`[profiles] could not create a profile for ${member.id} on join: ${error.message}`));
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
    // Only a real text edit re-runs a command. Discord also sends updates for
    // link previews (embeds), pins and flags — the content is unchanged there —
    // and a partial old message has no content to compare.
    if (typeof oldMessage.content !== "string" || typeof newMessage.content !== "string") return;
    if (oldMessage.content === newMessage.content) return;
    if (bot.awakenTime < oldMessage.createdTimestamp) {
        processCommand(newMessage).catch(reportDispatchError);
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

// loop thingy - checks for expired events/offers every 3 minutes.
// Every stage runs through runJob, so one failure (a DB blip, a Discord error
// while announcing) skips only that stage or item, not the rest of the tick.
// A tick still running when the next is due (a slow payout over the throttled
// link) makes the next one skip instead of running alongside it. One still
// running after 30 minutes is stuck on an await that will never settle (a DB
// call on a dead socket, say): that is reported and ticks start again, rather
// than every expiry, DM and stats flush stopping until a restart. The ends
// that pay all claim first, so a stuck tick that wakes up later can't pay twice.
const EXPIRY_TICK_HUNG_MS = 30 * 60000;
let expiryTickStartedAt = 0;   // 0 = no tick running
setInterval(async () => {
    // Before the bot is ready (or while a startup step is being retried) the
    // announcements and DMs have nowhere to go; the next tick catches up.
    // Nor does one start once a shutdown has begun.
    if (!bot.homeGuild || shuttingDown) return;
    if (expiryTickStartedAt) {
        const runningMs = Date.now() - expiryTickStartedAt;
        if (runningMs < EXPIRY_TICK_HUNG_MS) {
            console.log("[tick] the previous 3-minute tick is still running, skipping this one");
            return;
        }
        const minutes = Math.round(runningMs / 60000);
        console.error(`[tick] the previous 3-minute tick has been running for ${minutes}m, treating it as stuck and starting a new one`);
        reportBackgroundError("Expiry tick", new Error(`A 3-minute tick was stuck for ${minutes}m (an await that never settled); ticks were skipped until now and have restarted.`));
    }
    const startedAt = Date.now();
    expiryTickStartedAt = startedAt;
    try {
        await expiryTick();
    }
    finally {
        // A stuck tick that finishes after a newer one started leaves the
        // newer one's marker alone.
        if (expiryTickStartedAt === startedAt) expiryTickStartedAt = 0;
    }
}, 180000);

async function expiryTick() {
    // Race Week rollover check — idempotent, fire-and-forget (never in devMode:
    // shared prod DB, see the ready-hook note)
    if (allowRaceWeekRollover()) runJob("RaceWeek rollover check", checkRaceWeekRollover);
    // Scheduled pack battle starts (cd-startpackbattle <name> raceweek) — same
    // gate and same tick as the rollover, so "with Race Week" means with it.
    if (allowRaceWeekRollover()) await runJob("PackBattle schedule check", startScheduledPackBattles);

    // Fetch all active items in parallel (H-02: was 5 sequential queries, now 1 parallel batch).
    // Only the deadline is fetched for each: the full documents (rosters,
    // playerProgress, PvP entries, battle snapshots + playerStats) were pulled
    // ~480 times a day just to compare a date. The rare item that has expired
    // is reloaded in full by loadExpired, so the end handlers get the same lean
    // document as before.
    const active = await runJob("Expiry tick: active-item query", () => Promise.all([
        eventModel.find({ isActive: true }, { deadline: 1 }).lean(),
        championshipsModel.find({ isActive: true }, { deadline: 1 }).lean(),
        offerModel.find({ isActive: true }, { deadline: 1 }).lean(),
        packBattleModel.find({ isActive: true }, { deadline: 1 }).lean(),
        pvpEventModel.find({ isActive: true }, { deadline: 1 }).lean(),
        profileModel.find(
            { "settings.senddailynotifs": true, "dailyStats.notifReceived": false },
            { userID: 1, dailyStats: 1 }  // H-02: projection — only fetch needed fields
        ).lean()
    ]));

    // Nothing below can run without the item lists; the next tick retries.
    if (active) {
        const [events, championships, offers, packBattles, pvpEvents, playerDatum] = active;

        // endEvent / endOffer claim the document first (the dev bot runs this
        // loop on the same database), so an item two runs both load ends once.
        await runJob("Event expiry", async () => {
            for (let event of await loadExpired(eventModel, events)) {
                await runJob(`Event expiry: ${event.eventID} ${event.name}`, () => endEvent(event));
            }
        });

        await runJob("Championship expiry", async () => {
            for (let championship of await loadExpired(championshipsModel, championships)) {
                await runJob(`Championship expiry: ${championship.championshipID} ${championship.name}`, () => endChampionship(championship));
            }
        });

        await runJob("Offer expiry", async () => {
            for (let offer of await loadExpired(offerModel, offers)) {
                await runJob(`Offer expiry: ${offer.offerID} ${offer.name}`, () => endOffer(offer));
            }
        });

        // Auto-expire pack battles
        await runJob("PackBattle auto-expire", async () => {
            for (let battle of await loadExpired(packBattleModel, packBattles)) {
                // Claims the battle first (the dev bot runs this loop on the same
                // database), then pays placements, archives and deletes it.
                await runJob(`PackBattle auto-expire: ${battle.name}`, async () => {
                    if (await expirePackBattle(battle)) console.log(`[PackBattle] Auto-expired and ended: ${battle.name}`);
                });
            }
        });

        // Auto-expire PvP events — endPvpEvent() handles leaderboard archival + reward distribution
        await runJob("PvP auto-expire", async () => {
            for (let pvpEvent of await loadExpired(pvpEventModel, pvpEvents)) {
                await runJob(`PvP auto-expire: ${pvpEvent.name}`, async () => {
                    await endPvpEvent(pvpEvent);
                    console.log(`[PvP] Auto-expired and ended: ${pvpEvent.name}`);
                });
            }
        });

        await runJob("Daily reward notifications", () => sendDailyNotifications(playerDatum));
    }

    // Flush tracking stats to DB every 3 minutes (the buffer is in memory, so
    // a failed flush rolls into the next one)
    await runJob("Stats flush", () => tracker.flush());
}

// Discord's answers for "this player has left" / "this account is gone".
const DEPARTED_MEMBER_CODES = [RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser];

// "Your daily is ready" DMs, once per daily. notifReceived goes back to false
// when the player runs cd-daily.
async function sendDailyNotifications(playerDatum) {
    for (let { userID, dailyStats } of playerDatum) {
        let { lastDaily } = dailyStats;
        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(lastDaily).plus({ days: 1 }));
        if (interval.invalid !== null) {
            // L-06: Use member cache first, fall back to API fetch (the cache
            // holds every member from the startup prefetch, so in practice only
            // players who have left reach the API).
            let fetchError = null;
            let user = bot.homeGuild.members.cache.get(userID) || await bot.homeGuild.members.fetch(userID)
                .catch(error => { fetchError = error; return null; });

            // Both writes below only match the daily this tick saw: a player
            // who runs cd-daily while the loop is getting to them has a new
            // lastDaily, so they are left alone (no "now available" DM right
            // after claiming, and their next reminder still comes).
            const dueFilter = { userID, "dailyStats.notifReceived": false };
            if (lastDaily !== undefined) dueFilter["dailyStats.lastDaily"] = lastDaily;

            if (!user) {
                // Someone who left would otherwise be fetched again every 3
                // minutes forever. Mark them notified so they drop out of the
                // query; if they rejoin, their next cd-daily turns it back on.
                // Any other error is a blip: try again next tick.
                if (DEPARTED_MEMBER_CODES.includes(fetchError?.code)) {
                    await profileModel.updateOne(dueFilter, { "$set": { "dailyStats.notifReceived": true } });
                }
                else {
                    console.log(`unable to fetch user ${userID} for the daily notification: ${fetchError?.message ?? fetchError}`);
                }
                continue;
            }

            // Claim before sending: only the run that flips the flag sends, so
            // two runs (prod and dev share the database) or a crash after the
            // send can't DM twice. A crash between claim and send loses that
            // one reminder (the daily itself is unaffected); a send that fails
            // on a network blip or a Discord outage gives the claim back so the
            // next tick tries again.
            const claim = await profileModel.updateOne(
                dueFilter,
                { "$set": { "dailyStats.notifReceived": true } }
            );
            if (claim.modifiedCount !== 1) continue;

            await user.send("**Notification: Your daily reward is now available! Claim it using `cd-daily`.**")
                .catch(async error => {
                    console.log(`unable to send notification to user ${userID}`);
                    // A 4xx (DMs closed, the bot blocked) won't change by
                    // retrying, so it stays notified, as it always has. Only a
                    // network error or a Discord 5xx is retried.
                    if (typeof error?.status === "number" && error.status < 500) return;
                    await profileModel.updateOne({ userID }, { "$set": { "dailyStats.notifReceived": false } })
                        .catch(revertError => console.log(`could not re-queue the daily notification for ${userID}: ${revertError.message}`));
                });
        }
    }
}

// Snapshot active pack battle leaderboards every 30 minutes
setInterval(() => runJob("PackBattle snapshot", async () => {
    // M-14: Exclude snapshots from fetch — we only need playerStats to build a new snapshot
    const activeBattles = await packBattleModel.find({ isActive: true }, { snapshots: 0 }).lean();
    for (const battle of activeBattles) {
        if (Object.keys(battle.playerStats || {}).length > 0) {
            await takeSnapshot(battle);
        }
    }
}), 1800000);

// node-cron 3 drops a rejected job without a word (the rejection goes to an
// internal emitter nobody listens to), so every scheduled body runs through
// runJob, which logs and reports it.

// Auto-events — daily check spawns any template (src/autoevents/) whose
// cadence or spawn day is due. Proving Grounds and friends live here.
schedule("0 0 * * *", () => runJob("AutoEvents daily check", checkAutoEvents));

// The draft clock for car submissions — reminder at 14 days, auto-send at 30
// (consts). Midday UTC so the DMs land at a civil hour on both sides of the
// Atlantic. Idempotent, so the startup run above and this never double up.
schedule("0 12 * * *", async () => {
    await runJob("Submissions daily draft sweep", sweepDrafts);
    await runJob("Submissions daily suggestion sweep", sweepSuggestions);
});

// A failed refresh skips the "dealership has refreshed" DMs, as before.
schedule("0 */12 * * *", () => runJob("Dealership refresh", async () => {
    let { lastBMRefresh } = await serverStatModel.findOne({}) ?? {};
    await regenDealership();
    if (Interval.fromDateTimes(DateTime.fromISO(lastBMRefresh), DateTime.now()).length("hours") >= 11) {
        await regenBM();
    }

    if (!bot.homeGuild) return;
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
}));

// ── Shutdown ─────────────────────────────────────────────────────────────────
// A panel Stop/Restart (or Ctrl-C) sends SIGINT; some hosts send SIGTERM. The
// stats buffer lives in memory, so without this every restart lost up to 3
// minutes of tracking. New commands and ticks stop at once; running commands
// and a running tick get a short grace period (a command sitting on a button
// menu holds its lock until the menu times out, so the wait often runs to its
// cap), then the stats are flushed and the process exits. This is the only
// planned exit — nothing restarts the process, so recovery paths never exit.
const SHUTDOWN_GRACE_MS = 10000;
// Backstop: a flush or close hung on a dead link must not stop Stop working.
const SHUTDOWN_HARD_LIMIT_MS = 20000;
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) {
        console.log(`[shutdown] ${signal} received again, already shutting down (exits within ${SHUTDOWN_HARD_LIMIT_MS / 1000}s)`);
        return;
    }
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received: ignoring new commands, waiting up to ${SHUTDOWN_GRACE_MS / 1000}s for running ones`);
    setTimeout(() => {
        console.error(`[shutdown] not finished after ${SHUTDOWN_HARD_LIMIT_MS / 1000}s, exiting anyway`);
        process.exit(0);
    }, SHUTDOWN_HARD_LIMIT_MS).unref();

    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while ((Object.keys(bot.execList).length > 0 || expiryTickStartedAt) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    const running = Object.values(bot.execList).map(lock => lock?.name ?? lock);
    if (running.length > 0) console.log(`[shutdown] grace period over, ${running.length} command(s) still running: ${running.join(", ")}`);
    if (expiryTickStartedAt) console.log("[shutdown] grace period over, the 3-minute tick is still running");

    // flush() never throws; a failed write is logged there.
    await tracker.flush();
    console.log("[shutdown] stats flushed");
    try {
        await bot.destroy();
    }
    catch (error) {
        console.error(`[shutdown] gateway close failed: ${error?.message ?? error}`);
    }
    try {
        await connection.close();
    }
    catch (error) {
        console.error(`[shutdown] database close failed: ${error?.message ?? error}`);
    }
    console.log("[shutdown] done, exiting");
    process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// After this long a held command lock is treated as hung and the player's next
// command takes it over (the hung run's finally then leaves the new lock alone).
// Measured from the lock's startedAt, which open-ended flows (cd-hilo) refresh
// on every player action via classes.js keepCommandLockAlive().
const COMMAND_LOCK_STALE_MS = 20 * 60 * 1000;

async function processCommand(message) {
    if (shuttingDown) return;   // stopping: see shutdown()
    if (message.webhookId !== null || !bot.homeGuild) return; //webhooks not allowed
    if (!message.content.toLowerCase().startsWith(prefix) || message.author.bot) return;

    // Membership of the home guild, looked up by user ID so DMs (cd-submit,
    // cd-sub) work too. Anyone who isn't a member — never joined, left, kicked
    // or banned — is stopped here; the reply used to be sent and the command
    // then ran anyway.
    const member = bot.homeGuild.members.cache.get(message.author.id)
        || await bot.homeGuild.members.fetch(message.author.id)
            .catch(error => {
                // 10007 Unknown Member is the normal "not in the server" answer;
                // anything else is an API blip, logged so it can be told apart.
                if (error?.code !== 10007) console.log(`[processCommand] member fetch failed for ${message.author.id}: ${error?.message ?? error}`);
                return null;
            });
    if (!member) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, you are required to be in the Cloned Drives discord server to use this bot.",
            desc: "Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed",
            author: message.author
        });
        await errorMessage.sendMessage({ preserve: true });
        return;
    }
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
        return errorMessage.sendMessage({ preserve: true });
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
        return errorMessage.sendMessage({ preserve: true });
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
            return cooldownMessage.sendMessage({ preserve: true });
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    // Checked again after the member fetch above: a shutdown that began during
    // that await has already seen an empty execList, so no lock may be taken now.
    if (shuttingDown) return;

    // Per-user command lock. The entry is this run's own object: only this run
    // (its finally, or a non-preserve send from its own execute chain — see
    // classes.js) can release it, so a reply to some other message can't.
    const held = bot.execList[message.author.id];
    // A command holding the lock this long is hung, not busy — every bounded
    // flow (submission sessions are the longest, 15 min) ends well before, and
    // open-ended ones keep refreshing startedAt.
    const stale = !!held && Date.now() - held.startedAt > COMMAND_LOCK_STALE_MS;
    if (stale) console.log(`[processCommand] stale lock "${held.name}" for ${message.author.id}, taking over`);
    if (!held || stale) {
        tracker.trackCommand(command.name, message.author.id);
        const lock = { name: command.name, startedAt: Date.now() };
        bot.execList[message.author.id] = lock;
        try {
            // On-demand profile: a player who joined while the gateway was
            // down (or whose join-time create failed) gets one here.
            await upsertUserRecord(message.author);
            await runWithCommandLock(lock, () => command.execute(message, args));
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
            // Always clean up, even if the command throws — but only our own
            // lock: it may already be gone, or have been taken over as stale.
            if (bot.execList[message.author.id] === lock) delete bot.execList[message.author.id];
        }
    }
    else {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, you may only execute 1 command at a time.",
            desc: "This error will disappear once the currently executing command finishes (a command stuck for over 20 minutes is cleared automatically).",
            author: message.author,
            fields: [{ name: "Currently Executing", value: `\`${held.name}\`` }]
        });
        return errorMessage.sendMessage({ preserve: true });
    }
}

// Runs before every command (processCommand) as well as on join and at startup.
// knownProfiles (profileCache.js) holds users confirmed to have a profile, so
// for them this is a Set lookup — the existence query (a full DB round trip,
// ~180ms to the remote cluster) runs at most once per user per process. A
// profile delete (cd-reset all) drops the user from the Set again.
async function upsertUserRecord(user) {
    if (knownProfiles.has(user.id)) return;
    let params = { userID: user.id };
    let hasProfile = await profileModel.exists(params);
    if (!hasProfile && !user.bot) {
        try {
            await profileModel.create(params);
            tracker.trackNewPlayer();
            console.log(`profile created for user ${user.id}`);
        }
        catch (error) {
            // Duplicate key: a concurrent create (join event vs first command)
            // won the race — the profile exists, which is all we need.
            if (error?.code !== 11000) throw error;
        }
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
    return errorMessage.sendMessage({ preserve: true });
}
