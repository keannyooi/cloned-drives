"use strict";

/**
 * AUTO-EVENT SPAWNER
 * ==================
 * Turns templates in src/autoevents/*.json into real, playable events on a
 * schedule. A daily cron calls checkAutoEvents(); admins can force a spawn
 * with cd-autoevent. Generators are looked up by the template's `generator`
 * field — provinggrounds is the first; future generators just register here.
 *
 * Spawn state (per template) lives in serverStat.autoEventState:
 *   { lastSpawn, counter, lastCarPick, lastPackPick, currentEventID }
 */

const bot = require("../../config/config.js");
const { DateTime } = require("luxon");
const { getAutoEventTemplate, getAutoEventTemplateFiles, getCar } = require("./dataManager.js");
const { currentEventsChannelID, moneyEmojiID } = require("../consts/consts.js");
const carNameGen = require("./carNameGen.js");
const generateEventGraphic = require("./eventGraphic.js");
const notifyEventStart = require("./notifyEventStart.js");
const eventModel = require("../../models/eventSchema.js");
const serverStatModel = require("../../models/serverStatSchema.js");

const generators = {
    provinggrounds: require("./pgGenerator.js").generate
};

// Spawns are gated by two checks:
//  (1) DUE — enough CALENDAR days have rolled since the last spawn, compared by
//      start-of-day rather than an exact 24h span. A spawn runs a second or two
//      after midnight, so a strict ">= 1 day" diff falls just short the next
//      midnight and skips it — that bug made the "daily" fire every other day.
//  (2) DUPLICATE PROTECTION — skip only if a previous instance is still genuinely
//      running (more than DUPE_GUARD_MS left). Near-end-of-life instances don't
//      block, so a same-cadence daily rolls over cleanly. A template opts out of
//      this entirely with "ignoreDupe": true. Either way, name-uniqueness
//      (enforced in spawnFromTemplate) is the invariant that always holds.
const WEEKDAYS = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const DUPE_GUARD_MS = 2 * 60 * 60 * 1000;   // only block a respawn while the live instance has >2h left

function isDue(template, state, now) {
    if (template.spawnDay) {
        // now.weekday is locale-independent (1=Mon..7=Sun) — weekdayLong was not
        const wanted = WEEKDAYS[String(template.spawnDay).toLowerCase()];
        const alreadyToday = state.lastSpawn && DateTime.fromISO(state.lastSpawn).toISODate() === now.toISODate();
        return wanted === now.weekday && !alreadyToday;
    }
    const cadence = template.cadenceDays || 14;
    if (!state.lastSpawn) return true;
    const daysSince = Math.round(now.startOf("day").diff(DateTime.fromISO(state.lastSpawn).startOf("day"), "days").days);
    return daysSince >= cadence;
}

async function hasRunningInstance(state) {
    if (!state || !state.currentEventID) return false;
    const current = await eventModel.findOne({ eventID: state.currentEventID });
    if (!current || !current.isActive) return false;
    if (!current.deadline || current.deadline === "unlimited") return true;   // never-ending → always blocks
    return DateTime.fromISO(current.deadline).diff(DateTime.now()).milliseconds > DUPE_GUARD_MS;
}

/**
 * Daily tick: spawn every enabled template that is due and has no active
 * instance. Failures are logged per template and never block the others.
 */
async function checkAutoEvents() {
    // The midnight cron is registered at module load, before bot.once("ready")
    // assigns bot.homeGuild. If a restart lands on 00:00 we'd spawn an event the
    // announce step can't post — skip this tick; the cadence check re-fires next day.
    if (!bot.homeGuild) return;

    for (const file of getAutoEventTemplateFiles()) {
        const templateID = file.slice(0, -5);
        try {
            const template = getAutoEventTemplate(templateID);
            if (!template || template.enabled !== true) continue;

            const stat = await serverStatModel.findOne({});
            const state = (stat.autoEventState || {})[templateID] || {};

            // Spawn when due, unless a previous instance is still genuinely running
            // (and the template hasn't opted out of duplicate protection).
            if (!isDue(template, state, DateTime.now())) continue;
            if (!template.ignoreDupe && await hasRunningInstance(state)) continue;

            await spawnFromTemplate(templateID);
        } catch (error) {
            console.log(`[AutoEvents] ${templateID} spawn failed:`, error.stack);
        }
    }
}

/**
 * Generate + persist + announce one event from a template. Returns the new
 * event document's ID and the generator's debug info.
 */
async function spawnFromTemplate(templateID) {
    const template = getAutoEventTemplate(templateID);
    if (!template) throw new Error(`unknown auto-event template "${templateID}"`);
    const generate = generators[template.generator];
    if (!generate) throw new Error(`unknown generator "${template.generator}" (registered: ${Object.keys(generators).join(", ")})`);

    const stat = await serverStatModel.findOne({});
    const state = (stat.autoEventState || {})[templateID] || {};

    const result = generate(template, {
        counter: state.counter || 0,
        lastCarPick: state.lastCarPick,
        lastPackPick: state.lastPackPick
    });

    // The one hard invariant: never two events sharing a name (that breaks cd-pe's
    // name search / disambiguation). Generated names carry an incrementing roman
    // numeral so they differ each spawn — this is the safety net behind the
    // (optional) duplicate protection. Multiple DIFFERENTLY-named live instances of
    // a template are allowed (see the ignoreDupe toggle).
    const nameClash = await eventModel.findOne({ name: result.name });
    if (nameClash) {
        throw new Error(`an event named "${result.name}" already exists (${nameClash.eventID}); skipping to avoid a duplicate name.`);
    }

    // Reserve the event number atomically. A read-then-$inc would race a concurrent
    // cd-createevent / second spawn and mint a duplicate eventID (the eventID index
    // is non-unique, so a collision silently creates two docs and mis-routes writes).
    const reserved = await serverStatModel.findOneAndUpdate({}, { "$inc": { totalEvents: 1 } }, { new: true });
    const eventID = `evnt${reserved.totalEvents}`;
    const deadline = DateTime.now().plus({ days: template.durationDays || 14 }).toISO();
    await eventModel.create({
        eventID,
        name: result.name,
        isActive: true,
        deadline,
        roster: result.roster,
        playerProgress: {},
        eventType: result.eventType,
        entryFee: result.entryFee,
        paidPlayers: {}
    });

    const newState = {
        lastSpawn: DateTime.now().toISO(),
        counter: (state.counter || 0) + 1,
        lastCarPick: result.statePatch.lastCarPick ?? state.lastCarPick ?? null,
        lastPackPick: result.statePatch.lastPackPick ?? state.lastPackPick ?? null,
        currentEventID: eventID
    };
    await serverStatModel.updateOne({}, {
        "$set": { [`autoEventState.${templateID}`]: newState }
    });

    console.log(`[AutoEvents] spawned ${eventID} "${result.name}" (universe ${result.debug.universeSize}, solvers: ${result.debug.solverRamp.join(", ")})`);
    for (const w of result.debug.warnings) console.log(`[AutoEvents]   ⚠️ ${w}`);

    // announce — failure here never un-spawns the event
    try {
        const channel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const carReward = result.roster
            .flatMap(r => r.rewards && r.rewards.car ? [r.rewards.car.carID] : [])
            .map(id => carNameGen({ currentCar: getCar(id) }))
            .join(", ");
        const lines = [
            `**🏁 ${result.name} has begun!**`,
            `${result.roster.length} rounds — every one verified beatable. How deep does your garage go?`,
            result.entryFee > 0 ? `Entry: ${moneyEmoji}${result.entryFee.toLocaleString("en")} (one-time, charged at your first race).` : null,
            carReward ? `Final reward: **${carReward}**!` : null,
            `Ends <t:${Math.round(DateTime.fromISO(deadline).toSeconds())}:R> — play with \`cd-pe ${template.name.toLowerCase()}\`.`
        ].filter(Boolean);
        // Same event-board graphic admin events get via cd-startevent.
        const attachment = await generateEventGraphic({ roster: result.roster });
        await channel.send({ content: lines.join("\n"), files: [attachment] });

        // Per-template DM blast — OFF by default; opt in with `announceDMs: true`
        // in the template (keep it off for high-frequency templates like dailies
        // to avoid spamming every player every spawn). Fire-and-forget.
        if (template.announceDMs === true) {
            notifyEventStart(result.name).catch(err => console.error(`[AutoEvents] DM notifications failed: ${err.message}`));
        }
    } catch (error) {
        console.log(`[AutoEvents] announce failed (event is live regardless): ${error.message}`);
    }

    return { eventID, debug: result.debug, name: result.name };
}

module.exports = { checkAutoEvents, spawnFromTemplate, generators };
