"use strict";

/**
 * LEADERBOARDS
 * ============
 * Boards fall into four shapes:
 *   scalar    — one numeric profile field (money, trophies, bestweek, ...)
 *   raceweek  — this week's W/L + margin, sorted by wins
 *   cars      — garage size / total copies, counted by a Mongo aggregation so
 *               thousands of garage entries per player never enter Node
 *   owned     — "who owns this car?", filtered server-side by garage.carID
 *
 * Performance notes (the old version had all three of these):
 *   - ONE find() with a tight projection, not countDocuments + N skip/limit
 *     queries (skip is O(n) in Mongo, so later pages got progressively slower)
 *   - car boards never load garages into memory — the aggregation does the
 *     counting, returning one small number per player
 *   - placement is matched on userID, not on the display tag (tags are not
 *     unique or stable since Discord retired discriminators)
 */

const bot = require("../config/config.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { getWeekKey } = require("../util/functions/raceWeekManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
const listUpdate = require("../util/functions/listUpdate.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");

const BOARDS = {
    money: { kind: "scalar", field: "money", label: "Money", emojiID: moneyEmojiID },
    // Kept deliberately: fuse tokens are being retired, and this is how you
    // find the players still holding a balance to clear.
    fusetokens: { kind: "scalar", field: "fuseTokens", label: "Fuse Tokens", emojiID: fuseEmojiID },
    trophies: { kind: "scalar", field: "trophies", label: "Trophies", emojiID: trophyEmojiID },
    bestweek: { kind: "scalar", field: "raceWeekStats.bestWeek", label: "Best Race Week", emoji: "🏆", suffix: " wins" },
    // Frozen monument: nothing writes the old streak any more, so this is the
    // permanent record of the pre-Race-Week era.
    legacystreak: { kind: "legacy", label: "Legacy Random Race Streak", emoji: "⏫" },
    raceweek: { kind: "raceweek", label: "Race Week", emoji: "🏁" },
    uniquecars: { kind: "cars", metric: "unique", label: "Unique Cars", emoji: "🚗", suffix: " cars" },
    totalcars: { kind: "cars", metric: "total", label: "Total Cars", emoji: "🅿️", suffix: " cars" }
};

const BOARD_NAMES = Object.keys(BOARDS);

module.exports = {
    name: "leaderboards",
    aliases: ["lb", "leader", "leaderboard", "lead"],
    usage: ["<criteria>", "<criteria> [page number]", "owned <car name>"],
    args: 1,
    category: "Gameplay",
    description: "Shows the leaderboards. `cd-lb owned <car>` lists everyone who owns a specific car.",
    async execute(message, args) {
        const criteriaArg = (args[0] || "").toLowerCase();
        const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });

        // ── "who owns this car?" ─────────────────────────────────────────────
        if (criteriaArg === "owned" || criteriaArg === "owners") {
            return ownersBoard(args.slice(1));
        }

        const board = BOARDS[criteriaArg];
        if (!board) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid leaderboard criteria.",
                desc: `Choose one of: ${BOARD_NAMES.map(name => `\`${name}\``).join(", ")}\n`
                    + "Or find owners of a car with `cd-lb owned <car name>`.",
                author: message.author
            }).displayClosest(criteriaArg, BOARD_NAMES);
            return errorMessage.sendMessage();
        }

        const page = args[1] && !isNaN(args[1]) ? parseInt(args[1], 10) : 1;
        const rows = await buildRows(board);

        if (rows.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Cloned Drives Leaderboards (${board.label})`,
                desc: "No data available for this leaderboard yet.",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        return renderBoard(rows, board.label, board, page);

        // ── data ─────────────────────────────────────────────────────────────

        /** Rows: [{ userID, name, value, display }] sorted best-first. */
        async function buildRows(board) {
            if (board.kind === "cars") return carRows(board);

            const projection = { userID: 1 };
            if (board.kind === "scalar") projection[board.field] = 1;
            else if (board.kind === "legacy") {
                projection["raceWeekStats.legacyHighestStreak"] = 1;
                projection["rrStats.highestStreak"] = 1;
            }
            else if (board.kind === "raceweek") {
                projection["raceWeekStats.weeklyWins"] = 1;
                projection["raceWeekStats.weeklyLosses"] = 1;
                projection["raceWeekStats.weeklyMargin"] = 1;
            }

            const profiles = await profileModel.find({}, projection).lean();
            const rows = [];
            for (const profile of profiles) {
                const name = displayName(profile.userID);
                if (name === null) continue;   // bots only

                if (board.kind === "raceweek") {
                    const stats = profile.raceWeekStats || {};
                    const wins = stats.weeklyWins || 0;
                    const losses = stats.weeklyLosses || 0;
                    // Participants only — a board full of 0W/0L rows isn't one
                    if (wins === 0 && losses === 0) continue;
                    rows.push({
                        userID: profile.userID, name, value: wins, losses,
                        margin: stats.weeklyMargin || 0,
                        display: `${wins}W/${losses}L, ${Math.round(stats.weeklyMargin || 0).toLocaleString("en")} margin`
                    });
                }
                else {
                    const value = board.kind === "legacy"
                        // Migrated copy first; unmigrated profiles still have the original
                        ? (profile.raceWeekStats?.legacyHighestStreak ?? profile.rrStats?.highestStreak ?? 0)
                        : nested(profile, board.field);
                    if (typeof value !== "number" || value <= 0) continue;
                    rows.push({ userID: profile.userID, name, value, display: value.toLocaleString("en") + (board.suffix || "") });
                }
            }

            rows.sort((a, b) => b.value - a.value
                || (a.losses ?? 0) - (b.losses ?? 0)
                || (b.margin ?? 0) - (a.margin ?? 0)
                || a.name.localeCompare(b.name));
            return rows;
        }

        /**
         * Garage counts via aggregation — unique = entries, total = every copy
         * of every tune summed. Type-guarded so one malformed `upgrades` object
         * can't abort the whole pipeline.
         */
        async function carRows(board) {
            const totalExpr = {
                $sum: {
                    $map: {
                        input: { $ifNull: ["$garage", []] },
                        as: "car",
                        in: {
                            $cond: [
                                { $eq: [{ $type: "$$car.upgrades" }, "object"] },
                                { $sum: { $map: { input: { $objectToArray: "$$car.upgrades" }, as: "u", in: "$$u.v" } } },
                                0
                            ]
                        }
                    }
                }
            };
            const results = await profileModel.aggregate([
                { $project: {
                    userID: 1,
                    unique: { $size: { $ifNull: ["$garage", []] } },
                    total: totalExpr
                } }
            ]);

            const rows = [];
            for (const result of results) {
                const name = displayName(result.userID);
                if (name === null) continue;
                const value = board.metric === "unique" ? result.unique : result.total;
                if (typeof value !== "number" || value <= 0) continue;
                rows.push({ userID: result.userID, name, value, display: value.toLocaleString("en") + (board.suffix || "") });
            }
            rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
            return rows;
        }

        /** Everyone holding at least one copy of a specific car. */
        async function ownersBoard(carArgs) {
            if (carArgs.length === 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, no car provided.",
                    desc: "Usage: `cd-lb owned <car name>` (or `-<car ID>`).",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            const response = await search(message, carArgs.map(arg => arg.toLowerCase()), getCarFiles(), "car");
            if (!Array.isArray(response)) return;
            const [carFile, currentMessage] = response;
            const carID = carFile.slice(0, 6);
            const currentCar = getCar(carID);

            // Mongo filters by garage.carID — we never scan garages in Node.
            const owners = await profileModel
                .find({ "garage.carID": carID }, { userID: 1, "garage.$": 1 })
                .lean();

            const rows = [];
            for (const owner of owners) {
                const name = displayName(owner.userID);
                if (name === null) continue;
                const entry = (owner.garage || [])[0];
                const upgrades = (entry && typeof entry.upgrades === "object") ? entry.upgrades : {};
                const copies = Object.values(upgrades).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
                if (copies <= 0) continue;
                const tunes = Object.entries(upgrades)
                    .filter(([, n]) => typeof n === "number" && n > 0)
                    .map(([tune, n]) => `${tune}×${n}`)
                    .join(", ");
                rows.push({ userID: owner.userID, name, value: copies, display: `${copies} (${tunes})` });
            }
            rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

            const carLabel = carNameGen({ currentCar, rarity: true });
            if (rows.length === 0) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `Nobody owns ${carNameGen({ currentCar })} yet.`,
                    desc: "This car hasn't found a home in anyone's garage.",
                    author: message.author
                });
                return infoMessage.sendMessage({ currentMessage });
            }
            // No value emote — the title already names the car, so a per-row
            // icon just repeats it.
            return renderBoard(rows, `Owners of ${carLabel}`, {}, 1, currentMessage);
        }

        // ── render ───────────────────────────────────────────────────────────

        function renderBoard(rows, title, board, page, currentMessage) {
            const pageLimit = settings.listamount || defaultPageLimit;
            const totalPages = Math.max(1, Math.ceil(rows.length / pageLimit));
            if (page < 1 || page > totalPages) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, page number requested invalid.",
                    desc: `This leaderboard ends at page ${totalPages}.`,
                    author: message.author
                }).displayClosest(page);
                return errorMessage.sendMessage();
            }

            const placement = rows.findIndex(row => row.userID === message.author.id) + 1;
            const emoji = board.emojiID ? (bot.emojis.cache.get(board.emojiID) || "") : (board.emoji || "");

            return listUpdate(rows, page, totalPages, listDisplay, settings, currentMessage);

            function listDisplay(section, page, totalPages) {
                const offset = (page - 1) * pageLimit;
                // #1 overall wears the crown, wherever they appear.
                const places = section.map((row, i) => {
                    const rank = offset + i + 1;
                    return rank === 1
                        ? `${rwEmoji("winner")} **1.** \`${row.name}\``
                        : `**${rank}.** \`${row.name}\``;
                }).join("\n");
                const values = section.map(row => `${emoji}${row.display}`).join("\n");
                return new InfoMessage({
                    channel: message.channel,
                    title,
                    desc: `Your placement: **${placement || "N/A"}**/${rows.length}`,
                    author: message.author,
                    fields: [
                        { name: "Placement", value: places || "No data available.", inline: true },
                        { name: "Value", value: values || "No data available.", inline: true }
                    ],
                    footer: `Page ${page}/${totalPages}`
                });
            }
        }

        // ── helpers ──────────────────────────────────────────────────────────

        /** Display name for a userID, or null for bots. Never silently drops a
         *  real player: falls back through the user cache to the raw ID. */
        function displayName(userID) {
            const member = bot.homeGuild?.members.cache.get(userID);
            if (member) return member.user.bot ? null : member.user.tag;
            const user = bot.users.cache.get(userID);
            if (user) return user.bot ? null : user.tag;
            return userID;
        }

        function nested(object, field) {
            return field.split(".").reduce((o, key) => (o === null || o === undefined ? undefined : o[key]), object);
        }
    }
};
