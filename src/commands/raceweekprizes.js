"use strict";

const bot = require("../config/config.js");
const { InfoMessage, SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, adminRoleID } = require("../util/consts/consts.js");
const { getCar, getPack, getDriver } = require("../util/functions/dataManager.js");
const { getPrizes, rerollPrizes, getActiveLadder } = require("../util/functions/raceWeekManager.js");
const { driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const { LADDER } = require("../util/consts/raceWeek.js");
const carNameGen = require("../util/functions/carNameGen.js");
const rwEmoji = require("../util/functions/rwEmoji.js");
const { rarityEmoji: driverRarityEmoji } = require("../util/functions/rwEmoji.js");

// Human-readable line for one rung's prize object (may carry several keys).
// Type-tagged so cars/packs/drivers/money read apart at a glance; cars render
// with their CR + rarity emote (carNameGen rarity mode).
function prizeLine(prize) {
    if (!prize) return "???";
    const bits = [];
    // Cars and drivers already lead with their own rarity emote (CR icon /
    // driver tier), so a type tag on top would just be noise — only packs,
    // which have no rarity glyph of their own, get one. The type emote still
    // appears on the fallback paths, where there's no rarity icon to identify
    // what the entry even is.
    if (prize.car && prize.car.carID) {
        const car = getCar(prize.car.carID);
        bits.push(car
            ? carNameGen({ currentCar: car, rarity: true, removePrizeTag: true })
            : `${rwEmoji("car")} ${prize.car.carID}`);
    }
    if (prize.driver) {
        const driver = getDriver(prize.driver);
        bits.push(driver
            ? `${driverRarityEmoji(driver)} ${driverDisplayName(driver)}`
            : `${rwEmoji("driver")} ${prize.driver}`);
    }
    if (prize.pack) {
        const pack = getPack(prize.pack);
        bits.push(`${rwEmoji("pack")} ${pack ? pack.packName : prize.pack}`);
    }
    if (prize.money) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        bits.push(`${moneyEmoji || "💰"}${prize.money.toLocaleString("en")}`);
    }
    return bits.join("\n") || "???";
}

module.exports = {
    name: "raceweekprizes",
    aliases: ["rwprizes", "rrprizes"],
    usage: ["view [page]", "reroll <rung | all>"],
    args: 0,
    // Gameplay so ANY player can browse the week's ladder; `reroll` is gated
    // to the admin role in-command below.
    category: "Gameplay",
    description: "Views the current week's Race Week prize ladder. Admins can also reroll rungs from the configured pools (src/raceweek/prizePools.json).",
    async execute(message, args) {
        // Bare `cd-rrprizes` is the common case — treat it as `view`.
        const sub = (args[0] || "view").toLowerCase();

        if (sub === "reroll" && !message.member.roles.cache.has(adminRoleID)) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, rerolling prizes is admin-only.",
                desc: "You can browse this week's ladder with `cd-rrprizes view`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        if (sub === "view") {
            const prizes = await getPrizes();
            // The live prize map is the authority — includes custom rungs.
            const rungWinsList = Object.keys(prizes)
                .map(Number)
                .filter(wins => Number.isInteger(wins) && wins > 0)
                .sort((a, b) => a - b);
            const perPage = 12;
            const totalPages = Math.max(1, Math.ceil(rungWinsList.length / perPage));
            let page = parseInt(args[1]) || 1;
            if (page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            const pageRungs = rungWinsList.slice((page - 1) * perPage, page * perPage);

            const embedOptions = {
                channel: message.channel,
                title: "Race Week — this week's prizes",
                desc: `Prizes land instantly as you hit each rung! ${rwEmoji("exclusive")} = exclusive rung, ${rwEmoji("unique")} = custom rung.`,
                author: message.author,
                fields: pageRungs.map(wins => {
                    const builtIn = LADDER.find(rung => rung.wins === wins);
                    const tag = builtIn ? (builtIn.exclusive ? ` ${rwEmoji("exclusive")}` : "") : ` ${rwEmoji("unique")}`;
                    return {
                        name: `${wins} wins${tag}`,
                        value: prizeLine(prizes[String(wins)]),
                        inline: true
                    };
                })
            };
            if (totalPages > 1) {
                embedOptions.footer = `Page ${page} of ${totalPages} — \`cd-rrprizes view <page>\` for the rest`;
            }
            const infoMessage = new InfoMessage(embedOptions);
            return infoMessage.sendMessage();
        }

        if (sub === "reroll") {
            const target = (args[1] || "").toLowerCase();
            const rungWins = target === "all" ? null : parseInt(target);
            const activeLadder = getActiveLadder();
            if (target !== "all" && !activeLadder.some(rung => rung.wins === rungWins)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, invalid rung.",
                    desc: `Provide \`all\` or one of: \`${activeLadder.map(rung => rung.wins).join("`, `")}\` (custom rungs come from prizePools.json).`,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            try {
                const prizes = await rerollPrizes(rungWins);
                const affectedAll = (rungWins === null ? activeLadder : activeLadder.filter(rung => rung.wins === rungWins))
                    .filter(rung => prizes[String(rung.wins)]);
                const affected = affectedAll.slice(0, 25);
                const truncated = affectedAll.length - affected.length;
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: rungWins === null ? "Rerolled every ladder rung!" : `Rerolled the ${rungWins}-win rung!`,
                    desc: `Players who already claimed keep their old prize; new claimers get these.${truncated > 0 ? ` (+${truncated} more rungs rerolled — \`cd-rrprizes view\` to browse)` : ""}`,
                    author: message.author,
                    fields: affected.map(rung => ({
                        name: `${rung.wins} wins${rung.exclusive ? ` ${rwEmoji("exclusive")}` : ""}`,
                        value: prizeLine(prizes[String(rung.wins)]),
                        inline: true
                    }))
                });
                return successMessage.sendMessage();
            }
            catch (error) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, reroll failed.",
                    desc: `\`${error.message}\``,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
        }

        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, unknown subcommand.",
            desc: "Available: `view`, `reroll <rung | all>`",
            author: message.author
        });
        return errorMessage.sendMessage();
    }
};
