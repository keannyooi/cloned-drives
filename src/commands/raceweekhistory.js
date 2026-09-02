"use strict";

const { DateTime } = require("luxon");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { WEEK_KEY_FORMAT } = require("../util/consts/raceWeek.js");
const listRewards = require("../util/functions/listRewards.js");
const raceWeekResultModel = require("../models/raceWeekResultSchema.js");

/**
 * Accepts "2026-W34", "w34", "34" (assumes the current year) or "last".
 * Returns a weekKey string, or null for a listing request.
 */
function parseWeekKey(input) {
    if (!input) return null;
    const raw = String(input).trim().toLowerCase();
    if (raw === "last" || raw === "latest") return "last";
    if (/^\d{4}-w\d{1,2}$/.test(raw)) {
        const [year, week] = raw.split("-w");
        return `${year}-W${String(parseInt(week)).padStart(2, "0")}`;
    }
    const bare = raw.replace(/^w/, "");
    if (/^\d{1,2}$/.test(bare)) {
        return `${DateTime.utc().year}-W${String(parseInt(bare)).padStart(2, "0")}`;
    }
    return null;
}

module.exports = {
    name: "raceweekhistory",
    aliases: ["rwh", "rrhistory", "raceweekarchive"],
    usage: ["", "<week — 34, W34, 2026-W34, or last>"],
    args: 0,
    category: "Gameplay",
    description: "Browse past Race Weeks — champions, standings and what the prizes were.",
    async execute(message, args) {
        // ── one week in detail ───────────────────────────────────────────────
        if (args.length > 0) {
            const requested = parseWeekKey(args[0]);
            if (!requested) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, that doesn't look like a week.",
                    desc: "Try `cd-raceweekhistory 34`, `2026-W34`, or `last`.",
                    author: message.author
                }).sendMessage();
            }

            const week = requested === "last"
                ? await raceWeekResultModel.findOne({}).sort({ weekKey: -1 }).lean()
                : await raceWeekResultModel.findOne({ weekKey: requested }).lean();
            if (!week) {
                const known = await raceWeekResultModel.find({}, { weekKey: 1 }).sort({ weekKey: 1 }).lean();
                return new ErrorMessage({
                    channel: message.channel,
                    title: `No archive for ${requested === "last" ? "any week yet" : requested}.`,
                    desc: known.length > 0
                        ? `Archived weeks: ${known.map(entry => `\`${entry.weekKey}\``).join(", ")}`
                        : "The first archive is written at the next Monday rollover.",
                    author: message.author
                }).sendMessage();
            }

            const standings = week.standings || [];
            const podium = ["🥇", "🥈", "🥉"];
            const top = standings.slice(0, 10).map((entry, i) =>
                `${podium[i] || `**${entry.rank ?? i + 1}.**`} ${entry.username || entry.userID} — **${entry.weeklyWins}W** / ${entry.weeklyLosses ?? "?"}L`
            ).join("\n") || "*nobody raced this week*";

            // The caller's own week, if they placed outside the top 10
            const yourIndex = standings.findIndex(entry => entry.userID === message.author.id);
            const you = yourIndex >= 10
                ? `\n…\n**${standings[yourIndex].rank ?? yourIndex + 1}.** ${standings[yourIndex].username} — **${standings[yourIndex].weeklyWins}W** *(you)*`
                : "";

            // Prize map snapshot — what the rungs actually paid that week
            const rungKeys = Object.keys(week.prizes || {}).map(Number).filter(n => Number.isInteger(n)).sort((a, b) => a - b);
            let prizeList = "";
            for (const rung of rungKeys) {
                const line = `\`${String(rung).padStart(4)}\` ${listRewards(week.prizes[String(rung)])}\n`;
                if (prizeList.length + line.length > 1000) { prizeList += "…"; break; }
                prizeList += line;
            }

            const fields = [{ name: "Final standings", value: top + you }];
            if (prizeList) fields.push({ name: "That week's prizes", value: prizeList });

            return new InfoMessage({
                channel: message.channel,
                title: `Race Week ${week.weekKey}`,
                desc: week.totals
                    ? `**${week.totals.participants ?? "?"}** racers · **${(week.totals.totalWins ?? 0).toLocaleString("en")}** total wins`
                    : undefined,
                author: message.author,
                fields,
                footer: week.archivedAt ? `Archived ${DateTime.fromISO(week.archivedAt).toFormat("dd LLL yyyy")}` : undefined
            }).sendMessage();
        }

        // ── the listing ──────────────────────────────────────────────────────
        const weeks = await raceWeekResultModel.find({}).sort({ weekKey: -1 }).limit(20).lean();
        if (weeks.length === 0) {
            return new InfoMessage({
                channel: message.channel,
                title: "No Race Weeks archived yet.",
                desc: "The first archive is written at the next Monday rollover.",
                author: message.author
            }).sendMessage();
        }

        const currentKey = DateTime.utc().toFormat(WEEK_KEY_FORMAT);
        const list = weeks.map(week => {
            const champion = (week.standings || [])[0];
            return `\`${week.weekKey}\` — 👑 **${champion ? champion.username : "—"}** (${champion ? champion.weeklyWins : 0}W)`
                + (week.totals ? ` · ${week.totals.participants} racers` : "");
        }).join("\n");

        return new InfoMessage({
            channel: message.channel,
            title: `Race Week archive (${weeks.length} week${weeks.length === 1 ? "" : "s"})`,
            desc: list + `\n\nOpen one with \`cd-raceweekhistory <week>\` — the current week (\`${currentKey}\`) archives on Monday.`,
            author: message.author
        }).sendMessage();
    }
};
