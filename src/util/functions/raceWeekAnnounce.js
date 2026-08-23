"use strict";

/**
 * RACE WEEK ANNOUNCER
 * ===================
 * Everything the Monday rollover posts to the Race Week channel: the week
 * embed (podium, stats, ladder highlights, countdown, next-week teaser), the
 * card art, the discussion thread, the pin swap and the champion role.
 *
 * Split out of raceWeekManager so the rollover file stays about state and this
 * one stays about presentation. Called LAST in the rollover and wrapped by the
 * caller — every failure in here is best-effort and can never un-roll a week.
 */

const bot = require("../../config/config.js");
const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const {
    raceWeekChannelID,
    raceWeekUpdatesRoleID,
    raceWeekChampionRoleID
} = require("../consts/consts.js");
const { getCar, getDriver } = require("./dataManager.js");
const { LADDER, ENDLESS } = require("../consts/raceWeek.js");
const carNameGen = require("./carNameGen.js");
const rwEmoji = require("./rwEmoji.js");
const { driverDisplayName } = require("./raceWeekEvents.js");
const { rarityEmoji: driverRarityEmoji } = require("./rwEmoji.js");

// Fallback embed colour when the week isn't themed (_color in prizePools.json).
const DEFAULT_COLOR = 0xffc93c;
// 10080 minutes = 7 days, so the discussion thread archives itself exactly as
// the next week opens. Discord only accepts 60 / 1440 / 4320 / 10080.
const THREAD_ARCHIVE_MINUTES = 10080;
const MEDALS = ["🥇", "🥈", "🥉"];

const carArt = carID => {
    const car = carID ? getCar(carID) : null;
    return car && typeof car.racehud === "string" && car.racehud.trim() !== "" ? car.racehud : null;
};

// `rarity: true` gives the house "(<rarity> <CR>) Make Model (Year)" form that
// cd-carinfo uses. A prize with its rarity and CR attached reads as something
// worth chasing; a bare name reads as a spreadsheet row.
const carLabel = carID => {
    const car = carID ? getCar(carID) : null;
    return car ? carNameGen({ currentCar: car, rarity: true, removePrizeTag: true }) : "???";
};

const prizeCarID = (prizes, rung) => {
    const prize = prizes[String(rung)];
    return prize && prize.car ? prize.car.carID : null;
};

/** #rrggbb → int for EmbedBuilder, or null when the string isn't a valid hex. */
function parseColor(value) {
    if (typeof value !== "string" || !/^#?[0-9a-f]{6}$/i.test(value.trim())) return null;
    return parseInt(value.trim().replace(/^#/, ""), 16);
}

/**
 * Swap the champion role over to the new titleholder.
 * `prevChampionID` comes from last week's state; the cached `role.members`
 * sweep is a belt-and-braces catch for holders the state didn't know about
 * (manual grants, an interrupted rollover). Both are no-ops when clean.
 */
async function updateChampionRole(guild, newChampionID, prevChampionID) {
    if (!raceWeekChampionRoleID) return;
    const role = await guild.roles.fetch(raceWeekChampionRoleID).catch(() => null);
    if (!role) {
        console.log(`[RaceWeek] champion role ${raceWeekChampionRoleID} not found — skipping role swap`);
        return;
    }

    const toRemove = new Set();
    if (prevChampionID) toRemove.add(prevChampionID);
    for (const [memberID] of role.members) toRemove.add(memberID);
    toRemove.delete(newChampionID);

    for (const memberID of toRemove) {
        const member = await guild.members.fetch(memberID).catch(() => null);
        if (!member) continue;   // left the server — nothing to revoke
        await member.roles.remove(role).catch(error => {
            // Manage Roles alone is not enough: the bot's own highest role must
            // sit ABOVE this one in Server Settings → Roles.
            console.log(`[RaceWeek] could not revoke champion role from ${memberID}: ${error.message}`);
        });
    }

    if (!newChampionID) return;
    const champion = await guild.members.fetch(newChampionID).catch(() => null);
    if (!champion) {
        console.log(`[RaceWeek] champion ${newChampionID} is no longer in the server — role not granted`);
        return;
    }
    await champion.roles.add(role).catch(error => {
        console.log(`[RaceWeek] could not grant champion role to ${newChampionID}: ${error.message} `
            + "(check the bot's role sits above the champion role)");
    });
}

/**
 * Build the announcement embeds.
 * @returns {EmbedBuilder[]} main embed first, then the boss-car gallery.
 */
function buildEmbeds({ currentKey, prizes, standings, totals, meta, nextMeta, weekEndUnix }) {
    const themed = meta && (meta.label || meta.description || meta.color);
    const title = `${rwEmoji("raceweek")} Race Week ${currentKey}`
        + (meta && meta.label ? ` — ${meta.label}` : "")
        + " has begun!";

    const description = (meta && meta.description)
        || "Everyone is back to **0 wins** — the whole prize ladder is up for grabs again.";

    const main = new EmbedBuilder()
        .setColor((themed && parseColor(meta.color)) || DEFAULT_COLOR)
        .setTitle(title)
        // Countdown sits at the top: it's the only time-sensitive line, and
        // <t:unix:R> renders live in every viewer's own locale.
        .setDescription(`${description}\n\n⏳ **This week ends <t:${weekEndUnix}:R>**`);

    // ── last week, as two side-by-side columns rather than two stacked rows ──
    if (standings.length > 0) {
        main.addFields({
            name: `${rwEmoji("winner")} Last week`,
            value: standings.slice(0, 3)
                .map((entry, index) => `${MEDALS[index]} **${entry.username}** · ${entry.weeklyWins.toLocaleString("en-US")}`)
                .join("\n"),
            inline: true
        });
    }
    if (totals && totals.participants > 0) {
        main.addFields({
            name: "📊 In numbers",
            value: `**${totals.participants.toLocaleString("en-US")}** racer${totals.participants === 1 ? "" : "s"}\n`
                + `**${(totals.totalWins || 0).toLocaleString("en-US")}** win${totals.totalWins === 1 ? "" : "s"}`,
            inline: true
        });
    }

    // ── the ladder, as ONE block ─────────────────────────────────────────────
    // Previously three separate full-width fields, which made the 1000-win
    // exclusive read with the same weight as the stats line. Rungs are padded
    // so the numbers line up into an actual ladder, and every car carries its
    // rarity + CR — the thing that makes a prize look worth chasing, and what
    // cd-carinfo shows everywhere else.
    // Derived from LADDER, never hardcoded — the exclusive rung moved 1000 -> 500
    // on 2026-08-23 and a literal here would have silently emptied the headline.
    const exclusiveWins = (LADDER.find(rung => rung.exclusive) || LADDER[LADDER.length - 1]).wins;
    const exclusiveID = prizeCarID(prizes, exclusiveWins);
    const secretDriverID = prizes[String(exclusiveWins)] && prizes[String(exclusiveWins)].driver;
    const secretDriver = secretDriverID ? getDriver(secretDriverID) : null;
    const rotationDriverID = prizes["250"] && prizes["250"].driver;
    const rotationDriver = rotationDriverID ? getDriver(rotationDriverID) : null;

    const rung = (wins, text) => `\`${String(wins).padStart(4)}\` ${text}`;
    const ladder = [50, 100, 150].map(wins => rung(wins, carLabel(prizeCarID(prizes, wins))));
    if (rotationDriver) {
        ladder.push(rung(250, `${driverRarityEmoji(rotationDriver.rarity)} **${driverDisplayName(rotationDriver)}** · driver of the week`));
    }
    ladder.push(rung(exclusiveWins, `${rwEmoji("exclusive")} **${carLabel(exclusiveID)}**`));
    if (secretDriver) {
        // A continuation of the 1000 rung, not a rung of its own. An empty code
        // span was used to indent it and rendered as a stray grey box, so the
        // arrow carries the relationship instead — and the label leads, so it
        // reads as "here is a secret driver" rather than trailing off the name.
        ladder.push(`↳ SECRET driver: ${driverRarityEmoji(secretDriver.rarity)} **${driverDisplayName(secretDriver)}**`);
    }
    // The ladder does not stop at the exclusive: a rung lands every ENDLESS.step
    // wins after it, each rolling pack/car/driver. Listing 22 of them would bury
    // the headline, so it is summarised as one line.
    const firstEndless = exclusiveWins + ENDLESS.step;
    ladder.push(rung(`${firstEndless}+`.padStart(4), `🎲 a **mystery prize** every ${ENDLESS.step} wins — pack, car or driver`));

    // 🎁 rather than 🏆 — rwEmoji("winner") above already uses a trophy, and two
    // trophies in one embed reads as a mistake.
    main.addFields({ name: "🎁 This week's headline prizes", value: ladder.join("\n") });

    const tail = [];
    if (nextMeta && nextMeta.label) tail.push(`👀 Next week: **${nextMeta.label}**`);
    tail.push("`cd-rrprizes` for every rung · `cd-rr` to race");
    main.addFields({ name: "​", value: tail.join("\n") });

    // The 1000-win car is the headline, so it carries the big image.
    const exclusiveArt = carArt(exclusiveID);
    if (exclusiveArt) main.setImage(exclusiveArt);

    // ── extra images ─────────────────────────────────────────────────────────
    // The boss-car gallery was dropped: three cards of differing aspect ratios
    // get cropped into a cramped grid that looks worse than no images at all,
    // and the ladder already names each car with its rarity and CR. One hero
    // image (the 1000-win exclusive, set above) does more for the post.
    const embeds = [main];

    // Driver art is the exception — it's a different KIND of card, so it adds
    // information rather than repeating it. Only d00001 is illustrated today,
    // so this is usually a no-op that lights up as art gets filled in.
    for (const driver of [secretDriver, rotationDriver]) {
        if (!driver || typeof driver.image !== "string" || driver.image.trim() === "") continue;
        embeds.push(new EmbedBuilder()
            .setColor(main.data.color)
            .setTitle(`${driverRarityEmoji(driver.rarity)} ${driverDisplayName(driver)}`)
            .setImage(driver.image));
    }

    return embeds;
}

/**
 * Post the week, open its discussion thread, swap the pin and the champion
 * role. Returns the identifiers the caller should persist onto raceWeekState.
 *
 * @returns {Promise<{announcementID: string, championID: string}|null>}
 */
async function announceNewWeek({ currentKey, prizes, standings, totals, meta, nextMeta, prevAnnouncementID, prevChampionID }) {
    if (!bot.homeGuild) return null;

    const champion = standings[0] || null;
    const weekEnd = DateTime.utc().startOf("week").plus({ weeks: 1 });
    const embeds = buildEmbeds({
        currentKey, prizes, standings, totals, meta, nextMeta,
        weekEndUnix: Math.floor(weekEnd.toSeconds())
    });

    const content = raceWeekUpdatesRoleID ? `<@&${raceWeekUpdatesRoleID}>` : "";

    /**
     * devMode shares the production database AND the production server, so by
     * default it prints instead of posting.
     *
     * RACEWEEK_DEV_ANNOUNCE=true opts into a RENDER-ONLY post — the embeds go
     * up so the layout can be eyeballed, but every side effect is suppressed:
     * no role ping (that would notify real players), no pin swap, no champion
     * role change (that would grant a real role to a real member). Delete the
     * message afterwards and nothing was touched.
     */
    const previewOnly = bot.devMode && process.env.RACEWEEK_DEV_ANNOUNCE === "true";

    if (bot.devMode && !previewOnly) {
        console.log("[RaceWeek] devMode — announcement NOT sent. It would have posted:\n"
            + "----------------------------------------\n"
            + `ping: ${content || "(none)"}\n`
            + `${embeds.length} embed(s), title: ${embeds[0].data.title}\n`
            + `${(embeds[0].data.fields || []).map(f => `  [${f.name}] ${f.value}`).join("\n")}\n`
            + `champion role -> ${champion ? champion.username : "(nobody)"}\n`
            + "----------------------------------------\n"
            + "Set RACEWEEK_DEV_ANNOUNCE=true in .env to post it for real (render-only, no pings).");
        return null;
    }

    const channel = await bot.homeGuild.channels.fetch(raceWeekChannelID).catch(() => null);
    if (!channel) {
        console.log(`[RaceWeek] announcement channel ${raceWeekChannelID} not found — nothing posted`);
        return null;
    }

    const message = await channel.send({
        content: previewOnly
            ? "🧪 **PREVIEW — dev bot.** Not a real week; no pings, no pin, no role granted. Safe to delete."
            : content,
        embeds,
        // Without this the role mention renders but never actually pings.
        // A preview mentions nothing at all.
        allowedMentions: previewOnly
            ? { parse: [] }
            : { roles: raceWeekUpdatesRoleID ? [raceWeekUpdatesRoleID] : [] }
    });

    // ── thread ───────────────────────────────────────────────────────────────
    await message.startThread({
        name: `Race Week ${currentKey}${meta && meta.label ? ` — ${meta.label}` : ""} — Discussion`,
        autoArchiveDuration: THREAD_ARCHIVE_MINUTES
    }).catch(error => console.log(`[RaceWeek] could not open discussion thread: ${error.message}`));

    // Everything below MUTATES the live server, so a preview stops here — it
    // exists to show the layout, not to unpin last week or move a real role.
    if (previewOnly) {
        console.log("[RaceWeek] preview posted — pin swap and champion role skipped. Delete the message when done.");
        return null;
    }

    // ── pin swap ─────────────────────────────────────────────────────────────
    if (prevAnnouncementID) {
        const previous = await channel.messages.fetch(prevAnnouncementID).catch(() => null);
        if (previous && previous.pinned) {
            await previous.unpin().catch(error => console.log(`[RaceWeek] could not unpin last week: ${error.message}`));
        }
    }
    await message.pin().catch(error => console.log(`[RaceWeek] could not pin announcement: ${error.message}`));

    // ── champion role ────────────────────────────────────────────────────────
    await updateChampionRole(bot.homeGuild, champion ? champion.userID : null, prevChampionID)
        .catch(error => console.log(`[RaceWeek] champion role swap failed: ${error.message}`));

    return {
        announcementID: message.id,
        championID: champion ? champion.userID : ""
    };
}

module.exports = { announceNewWeek, updateChampionRole, buildEmbeds };
