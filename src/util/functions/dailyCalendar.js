"use strict";

const path = require("path");
const { readFileSync } = require("fs");
const { DateTime } = require("luxon");
const { getCar, getPack, getDriver } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const { driverDisplayName } = require("./raceWeekEvents.js");
const { toRewardEntries, rewardProblems } = require("./packBattleManager.js");

// Daily calendars (src/dailycalendar/calendars.json) — a bonus track on top of
// cd-daily. A player's Nth successful daily inside a calendar's dates pays its
// Nth reward, so missed days are simply not earned, never lost. Read fresh on
// every call like the Race Week prize pools: edits need no restart.
const CALENDARS_PATH = path.join(__dirname, "../../dailycalendar/calendars.json");
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const ID_FORMAT = /^[A-Za-z0-9_-]+$/;

// A problem prints once per process, not on every player's daily.
const reported = new Set();
function report(line) {
    if (reported.has(line)) return;
    reported.add(line);
    console.log(`[DailyCalendar] ${line}`);
}

function loadCalendars() {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(CALENDARS_PATH, "utf8"));
    }
    catch (error) {
        if (error.code !== "ENOENT") report(`calendars.json unreadable (${error.message}) — no calendar bonus`);
        return [];
    }
    const calendars = parsed && Array.isArray(parsed.calendars) ? parsed.calendars : [];
    return calendars.filter(cal => cal && typeof cal === "object" && !Array.isArray(cal));
}

// Reward objects may carry "_comment"-style notes; they never pay.
function cleanReward(reward) {
    if (!reward || typeof reward !== "object" || Array.isArray(reward)) return reward;
    return Object.fromEntries(Object.entries(reward).filter(([key]) => !key.startsWith("_")));
}

/** Everything wrong with one calendar — an empty list means it can run. */
function calendarProblems(cal) {
    const problems = [];
    const label = typeof cal.calendarID === "string" && cal.calendarID ? cal.calendarID : "(no calendarID)";
    if (typeof cal.calendarID !== "string" || !ID_FORMAT.test(cal.calendarID)) problems.push(`${label}: calendarID must be letters, numbers, - or _`);
    if (typeof cal.name !== "string" || !cal.name.trim()) problems.push(`${label}: needs a name`);
    for (const key of ["activeFrom", "activeUntil"]) {
        if (typeof cal[key] !== "string" || !DATE_FORMAT.test(cal[key]) || !DateTime.fromISO(cal[key]).isValid) {
            problems.push(`${label}: ${key} must be a YYYY-MM-DD date`);
        }
    }
    if (DATE_FORMAT.test(cal.activeFrom || "") && DATE_FORMAT.test(cal.activeUntil || "") && cal.activeFrom > cal.activeUntil) {
        problems.push(`${label}: activeFrom is after activeUntil`);
    }
    if (!Array.isArray(cal.rewards) || cal.rewards.length === 0) problems.push(`${label}: rewards must be a non-empty list`);
    else cal.rewards.forEach((reward, i) => problems.push(...rewardProblems(cleanReward(reward), `${label} day ${i + 1}`)));
    return problems;
}

const localDate = now => now.toFormat("yyyy-MM-dd");
const hasDates = cal => typeof cal.activeFrom === "string" && typeof cal.activeUntil === "string";

/**
 * The calendar running today (enabled and inside its dates) plus its problems.
 * One with problems is still returned so callers can say why it's paused, but
 * it never pays until fixed.
 * @returns {{ calendar: Object, problems: string[] } | null}
 */
function currentCalendar(now = DateTime.now()) {
    const today = localDate(now);
    const calendar = loadCalendars().find(cal => cal.enabled !== false && hasDates(cal)
        && today >= cal.activeFrom && today <= cal.activeUntil);
    if (!calendar) return null;
    const problems = calendarProblems(calendar);
    for (const problem of problems) report(`${problem} — calendar paused until fixed`);
    return { calendar, problems };
}

/** The soonest enabled calendar that hasn't started yet, for the teaser view. */
function upcomingCalendar(now = DateTime.now()) {
    const today = localDate(now);
    return loadCalendars()
        .filter(cal => cal.enabled !== false && hasDates(cal) && cal.activeFrom > today)
        .sort((a, b) => a.activeFrom.localeCompare(b.activeFrom))[0] || null;
}

function progressOf(dailyStats, calendarID) {
    const entry = dailyStats && dailyStats.calendars && dailyStats.calendars[calendarID];
    const claimed = entry && Number.isInteger(entry.claimed) && entry.claimed > 0 ? entry.claimed : 0;
    return { claimed, lastClaim: (entry && entry.lastClaim) || null };
}

/**
 * What one successful cd-daily earns from the running calendar. The caller
 * folds `set` and `entries` into the daily's own profile update, so the daily
 * and its calendar step land together.
 * @returns null (nothing running, or paused)
 *        | { calendar, complete: true, total }
 *        | { calendar, day, total, reward, next, set, entries }
 */
function planDailyClaim(dailyStats, now = DateTime.now()) {
    const current = currentCalendar(now);
    if (!current || current.problems.length > 0) return null;
    const { calendar } = current;
    const total = calendar.rewards.length;
    const { claimed } = progressOf(dailyStats, calendar.calendarID);
    if (claimed >= total) return { calendar, complete: true, total };

    const day = claimed + 1;
    const reward = cleanReward(calendar.rewards[day - 1]);
    const progressPath = `dailyStats.calendars.${calendar.calendarID}`;
    return {
        calendar,
        day,
        total,
        reward,
        next: day < total ? cleanReward(calendar.rewards[day]) : null,
        set: { [`${progressPath}.claimed`]: day, [`${progressPath}.lastClaim`]: now.toISO() },
        entries: toRewardEntries(reward, `${calendar.name}: Day ${day}`)
    };
}

/**
 * One reward as text: "Porsche Titan Pack", "<money emoji>100,000 + <trophy emoji>25".
 * @param {Object} emojis { money, trophies, fuseTokens } — Discord emoji objects or strings
 */
function describeReward(reward, emojis = {}) {
    return Object.entries(cleanReward(reward) || {}).map(([key, value]) => {
        if (key === "car") {
            const car = getCar(value && value.carID);
            return car ? carNameGen({ currentCar: car, rarity: true, upgrade: value.upgrade }) : String(value && value.carID);
        }
        if (key === "pack") {
            const pack = getPack(value);
            return pack ? pack["packName"] : String(value);
        }
        if (key === "driver") {
            const driver = getDriver(value);
            return driver ? `Driver: ${driverDisplayName(driver)}` : String(value);
        }
        const amount = typeof value === "number" ? value.toLocaleString("en") : String(value);
        if (emojis[key]) return `${emojis[key]}${amount}`;
        return `${amount} ${key === "fuseTokens" ? "fuse tokens" : key}`;
    }).join(" + ");
}

/** Art for the daily embed: the car's HUD or the pack's art, else null. */
function rewardImage(reward) {
    const clean = cleanReward(reward) || {};
    if (clean.car) {
        const car = getCar(clean.car.carID);
        if (car && car["racehud"]) return car["racehud"];
    }
    if (clean.pack) {
        const pack = getPack(clean.pack);
        if (pack && pack["pack"]) return pack["pack"];
    }
    return null;
}

/** "#c8102e" → 0xc8102e for the embed; anything else → null (keep the default). */
function calendarColor(calendar) {
    const hex = calendar && typeof calendar.color === "string" ? calendar.color.replace(/^#/, "") : "";
    return /^[0-9a-f]{6}$/i.test(hex) ? parseInt(hex, 16) : null;
}

/**
 * cd-daily calendar — the whole track with this player's progress, or the
 * next calendar as a teaser before it starts.
 * @returns {{ title: string, desc: string, color: number|null }}
 */
function calendarView(dailyStats, emojis = {}, now = DateTime.now()) {
    const current = currentCalendar(now);
    const calendar = current ? current.calendar : upcomingCalendar(now);
    if (!calendar) {
        return {
            title: "No daily calendar right now",
            desc: "When one is running, every `cd-daily` also pays out a bonus reward from it.",
            color: null
        };
    }

    const total = Array.isArray(calendar.rewards) ? calendar.rewards.length : 0;
    const claimed = current ? Math.min(progressOf(dailyStats, calendar.calendarID).claimed, total) : 0;
    const lines = (calendar.rewards || []).map((reward, i) => {
        const day = i + 1;
        const marker = day <= claimed ? "✅" : (current && day === claimed + 1 ? "▶️" : "▫️");
        return `${marker} **Day ${day}** — ${describeReward(reward, emojis)}`;
    });

    const until = DateTime.fromISO(calendar.activeUntil);
    const untilText = until.isValid ? until.toFormat("ccc d LLL") : calendar.activeUntil;
    let intro;
    if (!current) {
        const from = DateTime.fromISO(calendar.activeFrom);
        intro = `Starts **${from.isValid ? from.toFormat("ccc d LLL") : calendar.activeFrom}**. From then until ${untilText}, every \`cd-daily\` also pays your next reward below.`;
    }
    else if (current.problems.length > 0) {
        const shown = current.problems.slice(0, 5).map(problem => `• ${problem}`).join("\n");
        intro = "⚠️ Paused while staff fix a reward. Nothing is lost: your progress carries on once it's fixed.\n"
            + shown + (current.problems.length > 5 ? `\n…and ${current.problems.length - 5} more.` : "");
    }
    else if (claimed >= total) {
        intro = `🎉 Complete! You've collected all ${total} rewards.`;
    }
    else {
        const daysLeft = until.isValid ? Math.max(1, Math.round(until.startOf("day").diff(now.startOf("day"), "days").days) + 1) : null;
        intro = `Every \`cd-daily\` until **${untilText}** also pays your next reward (▶️) into \`cd-rewards\`.`
            + (daysLeft ? ` ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.` : "");
    }

    return { title: `🗓️ ${calendar.name} — ${claimed}/${total}`, desc: `${intro}\n\n${lines.join("\n")}`, color: calendarColor(calendar) };
}

module.exports = {
    loadCalendars,
    calendarProblems,
    currentCalendar,
    upcomingCalendar,
    progressOf,
    planDailyClaim,
    describeReward,
    rewardImage,
    calendarColor,
    calendarView
};
