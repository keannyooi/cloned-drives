"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, moneyEmojiID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const confirm = require("../util/functions/confirm.js");
const { costFromStock, getSellPrice } = require("../util/functions/upgradePrice.js");
const { trackMoneyEarned, trackCarsSold } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

// Fraction of the original upgrade investment refunded when selling an upgraded car.
// 0.20 = 20% — small enough that selling isn't an exploit, generous enough to make
// sense as a "I changed my mind" recovery.
const UPGRADE_REFUND_RATE = 0.20;

module.exports = {
    name: "sell",
    aliases: ["s", "sellcat"],
    usage: [
        "[amount / 'all'] | <car name goes here>",
        "[amount / 'all'] | -<car ID>",
        "dupes                         — bulk-sell stock dupes, keep 3 of each (default)",
        "dupes <N>                     — keep N stock copies (override default of 3)",
        "Filter compose with AND. All optional:",
        "  Ranges:  cr 500-800  |  modelyear 1990-2000  |  seatcount 2  |  under <CR> (cr shorthand)",
        "  Exact:   country JP  |  driveType RWD  |  tyreType Performance  |  gc Low  |  enginePos Front  |  fuelType Petrol  |  creator <name>",
        "  Tags:    make Honda  |  tags Muscle  |  collection Daily  |  bodystyle Coupe  |  hiddentag <name>",
        "  Bools:   abs true  |  tcs false",
        "  Custom:  rarity Epic  |  search Mustang",
        "(example: dupes 2 country US tags muscle cr 400-700)"
    ],
    description: "Sells cars from your garage. Supports bulk-sell with filters; upgraded cars are protected from bulk.",
    args: 1,
    category: "Gameplay",
    async execute(message, args) {
        const playerData = await profileModel.findOne({ userID: message.author.id });

        // ─── Bulk dupes mode ────────────────────────────────────────────────
        // cd-sell dupes              → keep 1 of each car, sell rest
        // cd-sell dupes 2            → keep 2 of each car
        // cd-sell dupes under 200    → only sell dupes of cars with CR < 200
        // cd-sell dupes 1 under 200  → both
        // Note: the 5-car-minimum check is skipped here because dupes mode never
        // reduces unique car count (always retains ≥1 per carID).
        if (args[0].toLowerCase() === "dupes") {
            return bulkSellDupes(message, playerData, args.slice(1));
        }

        if (playerData.garage.length <= 5) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, 5 or less cars detected in your garage.",
                desc: "The minimum amount of cars you are supposed to have is 5. This is to prevent people selling/fusing their entire garage early on and getting stuck.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        let query, amount = 1, startFrom, searchByID = false;
        if (args[0].toLowerCase() === "all" && args[1]) {
            startFrom = 1;
        }
        else if (isNaN(args[0]) || !args[1] || parseInt(args[0]) > 50 || parseInt(args[0]) < 1) {
            startFrom = 0;
        }
        else {
            amount = Math.ceil(parseInt(args[0]));
            startFrom = 1;
        }
        if (args[startFrom].toLowerCase().startsWith("-c")) {
            query = [args[startFrom].toLowerCase().slice(1)];
            searchByID = true;
        }
        else {
            query = args.slice(startFrom, args.length).map(i => i.toLowerCase());
        }

        await new Promise(resolve => resolve(searchGarage({
            message,
            query,
            garage: playerData.garage,
            amount,
            searchByID,
            restrictedMode: true
        })))
            .then(async response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                await sell(result, amount, playerData, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function sell(currentCar, amount, playerData, currentMessage) {
            // Diamond cars cannot be sold (sell/fuse protected by design).
            // Players can only part with them via `cd-diamondexchange` for another diamond.
            const carData = getCar(currentCar.carID);
            if (carData && carData.diamond === true) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, ${carNameGen({ currentCar: carData })} is a Diamond car and cannot be sold.`,
                    desc: "Diamond cars are sell- and fuse-protected. If you own duplicates, use `cd-diamondexchange` to trade one for a different Diamond car.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            // No targetUpgrade restriction — all tunes (including 699/969/996) are sellable.
            // The upgrade investment is partially refunded via UPGRADE_REFUND_RATE below.
            await new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount, currentMessage })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [upgrade, currentMessage] = response;
                    const car = getCar(currentCar.carID);
                    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                    if (args[0].toLowerCase() === "all") {
                        amount = currentCar.upgrades[upgrade];
                    }

                    let money = getSellPrice(car["cr"]);
                    const basePerCar = money;

                    // Upgrade refund — partial recovery of the cost the player paid to reach
                    // this tune from stock. 20% of that cost, per car. Stock cars get 0.
                    const upgradeRefundPerCar = car["cr"] > 1500
                        ? 0  // BOSS cars get the flat sell price only — no refund inflation
                        : Math.round(costFromStock(car["cr"], upgrade) * UPGRADE_REFUND_RATE);

                    const totalBase = basePerCar * amount;
                    const totalRefund = upgradeRefundPerCar * amount;
                    money = totalBase + totalRefund;

                    const refundLine = upgradeRefundPerCar > 0
                        ? `\n_(includes ${moneyEmoji}${totalRefund.toLocaleString("en")} upgrade refund — 20% of original tune cost)_`
                        : "";
                    const confirmationMessage = new InfoMessage({
                        channel: message.channel,
                        title: `Are you sure you want to sell ${amount} of your ${carNameGen({ currentCar: car, upgrade, rarity: true })} for ${moneyEmoji}${money.toLocaleString("en")}?${refundLine}`,
                        desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                        author: message.author,
                        image: car["racehud"]
                    });
                    
                    try {
                        await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);
                    }
                    catch (error) {
                        throw error;
                    }

                    async function acceptedFunction(currentMessage) {
                        let balance = playerData.money + money;
                        updateHands(playerData, currentCar.carID, upgrade, "remove");
                        currentCar.upgrades[upgrade] -= amount;
                        if (calcTotal(currentCar) === 0) {
                            playerData.garage.splice(playerData.garage.indexOf(currentCar), 1);
                        }
                        await profileModel.updateOne({ userID: message.author.id }, {
                            money: balance,
                            garage: playerData.garage,
                            hand: playerData.hand,
                            decks: playerData.decks
                        });

                        trackMoneyEarned(money);
                        trackCarsSold(amount);

                        const infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully sold your ${carNameGen({ currentCar: car, upgrade, rarity: true })}!`,
                            desc: `You earned ${moneyEmoji}${money.toLocaleString("en")}!`,
                            author: message.author,
                            image: car["racehud"],
                            fields: [
                                { name: "Your Money Balance", value: `${moneyEmoji}${balance.toLocaleString("en")}` }
                            ]
                        });
                        await infoMessage.sendMessage({ currentMessage });
                        return infoMessage.removeButtons();
                    }
                });
        }
    }
};

// ============================================================================
// Bulk-sell duplicates
// ============================================================================

// Default number of stock (tune 000) copies to keep per car when running
// `cd-sell dupes` without an explicit number.
const DEFAULT_KEEP_STOCK = 3;

// Upgraded tunes — these copies are NEVER touched by bulk-sell, ever.
// Only stock (000) copies are eligible. This protects players from accidentally
// nuking thousands of dollars of upgrade investment with a single command.
const UPGRADED_TUNES = ["333", "666", "699", "969", "996"];

/** Map a car to its rarity NAME (string), mirroring rarityCheck.js's bracket logic. */
function rarityNameOf(car) {
    if (car.diamond === true) return "diamond";
    if (car.cr > 1500) return "boss";
    if (car.cr > 999)  return "mystic";
    if (car.cr > 849)  return "legendary";
    if (car.cr > 699)  return "exotic";
    if (car.cr > 549)  return "epic";
    if (car.cr > 399)  return "rare";
    if (car.cr > 249)  return "uncommon";
    if (car.cr > 99)   return "common";
    return "standard";
}

// ─── Filter definitions (mirrors editFilter.js / filter.js criteria) ────────
//
// Each filter has a keyword that maps to a car-data field + a value type:
//   range       — numeric range, syntax: `cr 500-800` (range) or `cr 500` (exact)
//   exact       — single-value exact match, case-insensitive
//   arrayMatch  — substring match on a field that can be string OR array of strings
//   bool        — true/false
//
// Filters that filter.js supports but bulk-sell skips intentionally:
//   isPrize    — prize cars are always protected from bulk-sell anyway
//   isOwned    — meaningless (we're iterating the garage already)
//   isBM       — BM cars are always protected from bulk-sell anyway
//   isStock    — by definition we only sell stock copies
//   isUpgraded — by definition we never sell upgraded copies
//   isMaxed    — meaningless for stock-only sells

const RANGE_FILTERS = {
    cr:        "cr",
    modelyear: "modelYear",
    seatcount: "seatCount"
};
const EXACT_FILTERS = {
    country:   "country",
    creator:   "creator",
    tyretype:  "tyreType",
    drivetype: "driveType",
    enginepos: "enginePos",
    fueltype:  "fuelType",
    gc:        "gc"
};
const ARRAY_FILTERS = {
    make:       "make",
    tags:       "tags",
    tag:        "tags",       // alias for tags (singular feels natural)
    collection: "collection",
    bodystyle:  "bodyStyle",
    hiddentag:  "hiddenTag"
};
const BOOL_FILTERS = {
    abs:       "abs",
    tcs:       "tcs"
};

/** Build a human-readable summary of active filters for the confirm/error embeds. */
function describeFilters(f) {
    const parts = [];
    for (const [field, r] of Object.entries(f.range)) {
        if (r.min === r.max) parts.push(`${field} = ${r.min}`);
        else if (r.min === 1) parts.push(`${field} < ${r.max + 1}`);
        else parts.push(`${field} ${r.min}-${r.max}`);
    }
    for (const [field, val] of Object.entries(f.exact)) parts.push(`${field} = ${val}`);
    for (const [field, val] of Object.entries(f.array)) parts.push(`${field} ~ ${val}`);
    for (const [field, val] of Object.entries(f.bool))  parts.push(`${field} = ${val}`);
    if (f.rarity) parts.push(`rarity = ${f.rarity}`);
    if (f.search) parts.push(`search ~ ${f.search}`);
    return parts.join(" • ");
}

/** Parse a range value like "500-800" or "500" into { min, max }, or null if invalid. */
function parseRangeValue(str) {
    if (!str) return null;
    if (String(str).includes("-")) {
        const parts = String(str).split("-").map(s => parseInt(s.trim(), 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] <= parts[1]) {
            return { min: parts[0], max: parts[1] };
        }
        return null;
    }
    const v = parseInt(str, 10);
    return isNaN(v) ? null : { min: v, max: v };
}

/** Test a car against a parsed filter set. All filters AND together. */
function carMatchesFilters(car, f) {
    // Range filters
    for (const [field, range] of Object.entries(f.range)) {
        const v = car[field];
        if (typeof v !== "number") return false;
        if (v < range.min || v > range.max) return false;
    }
    // Exact filters
    for (const [field, val] of Object.entries(f.exact)) {
        if (String(car[field] || "").toLowerCase() !== val) return false;
    }
    // Array-or-string substring filters
    for (const [field, val] of Object.entries(f.array)) {
        const fv = car[field];
        if (fv === undefined || fv === null) return false;
        const list = Array.isArray(fv) ? fv : [fv];
        if (!list.some(item => String(item).toLowerCase().includes(val))) return false;
    }
    // Boolean filters
    for (const [field, val] of Object.entries(f.bool)) {
        if (car[field] !== val) return false;
    }
    // Rarity (custom — computed from CR + flags)
    if (f.rarity && rarityNameOf(car) !== f.rarity) return false;
    // Search — substring across make + model
    if (f.search) {
        const makeStr = Array.isArray(car.make) ? car.make.join(" ") : (car.make || "");
        const name = `${makeStr} ${car.model || ""}`.toLowerCase();
        if (!name.includes(f.search)) return false;
    }
    return true;
}

/**
 * cd-sell dupes [N] [filter <value>] [filter <value>] ...
 *
 * Bulk-sells STOCK (000) duplicate copies of cars in the garage.
 *   - Default: keep 3 stock per car. Override with `cd-sell dupes <N>`.
 *   - Upgraded copies (333/666/699/969/996) are NEVER sold (protected).
 *   - Skips prize / diamond / BM cars entirely.
 *   - Filters compose with AND. See FILTER_DEFS above for all supported keys.
 *   - Safety net: a car with no upgraded copies always retains ≥ 1 stock,
 *     even if `keep 0` was requested.
 *
 * Filter syntax (all optional, all stack):
 *   Ranges:  cr 500-800  |  modelyear 1990-2000  |  seatcount 2  |  under 500 (shorthand for cr <N)
 *   Exact:   country JP  |  driveType RWD  |  tyreType Performance  |  gc Low  |  enginePos Front  |  fuelType Petrol  |  creator <name>
 *   Tags:    make Honda  |  tags Muscle  |  collection Daily  |  bodystyle Coupe  |  hiddentag <name>
 *   Bools:   abs true    |  tcs false
 *   Custom:  rarity Epic  |  search Mustang
 */
async function bulkSellDupes(message, playerData, args) {
    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);

    // Parse flags. Order-independent. Each filter keyword consumes the next token.
    const filters = { range: {}, exact: {}, array: {}, bool: {}, rarity: null, search: null };
    let keepStock = DEFAULT_KEEP_STOCK;
    let keepExplicit = false;
    const unrecognised = [];

    for (let i = 0; i < args.length; i++) {
        const tok = args[i].toLowerCase();
        const next = args[i + 1];

        // Keep count keyword
        if (tok === "keep") {
            const v = parseInt(next, 10);
            if (!isNaN(v) && v >= 0) { keepStock = v; keepExplicit = true; }
            i++; continue;
        }

        // CR shorthand
        if (tok === "under" || tok === "below") {
            const v = parseInt(next, 10);
            if (!isNaN(v) && v >= 1) filters.range.cr = { min: 1, max: v - 1 };
            i++; continue;
        }

        // Rarity / search (custom one-off filters)
        if (tok === "rarity" && next) { filters.rarity = next.toLowerCase(); i++; continue; }
        if (tok === "search" && next) { filters.search = next.toLowerCase(); i++; continue; }

        // Range filters (cr / modelyear / seatcount)
        if (RANGE_FILTERS[tok] && next !== undefined) {
            const r = parseRangeValue(next);
            if (r) filters.range[RANGE_FILTERS[tok]] = r;
            i++; continue;
        }

        // Exact filters
        if (EXACT_FILTERS[tok] && next) {
            filters.exact[EXACT_FILTERS[tok]] = next.toLowerCase();
            i++; continue;
        }

        // Array filters
        if (ARRAY_FILTERS[tok] && next) {
            filters.array[ARRAY_FILTERS[tok]] = next.toLowerCase();
            i++; continue;
        }

        // Boolean filters
        if (BOOL_FILTERS[tok] && next) {
            const v = next.toLowerCase();
            if (v === "true" || v === "false") filters.bool[BOOL_FILTERS[tok]] = (v === "true");
            i++; continue;
        }

        // Bare number → keep count override
        if (!isNaN(tok)) {
            const v = parseInt(tok, 10);
            if (v >= 0 && v <= 1000) { keepStock = v; keepExplicit = true; }
            continue;
        }

        // Anything else — track for the "did you mean" hint in the error path
        unrecognised.push(tok);
    }

    // Surface unrecognised filter keywords up-front so users aren't surprised
    if (unrecognised.length > 0) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, unknown filter keyword(s).",
            desc: `Didn't recognise: ${unrecognised.map(t => `\`${t}\``).join(", ")}.\n\nRun \`cd-help sell\` to see the full list of supported filters.`,
            author: message.author
        }).sendMessage();
    }

    // ─── Build the to-sell list ─────────────────────────────────────────────
    const toSell = []; // { carID, count, basePerCar }
    const perModelCount = new Map();
    let totalCount = 0;
    let totalMoney = 0;
    let modelsTouched = 0;
    let modelsSafetyKept = 0; // count of cars where safety net forced keepStock to 1

    for (const garageCar of playerData.garage) {
        const car = getCar(garageCar.carID);
        if (!car) continue;
        if (car.isPrize) continue;
        if (car.diamond === true) continue;
        if (car.reference) continue;

        if (!carMatchesFilters(car, filters)) continue;

        const stockOwned = garageCar.upgrades?.["000"] || 0;
        if (stockOwned === 0) continue; // nothing to do — only stock is sellable in bulk

        // Count upgraded copies (NEVER touched, but used for the safety net)
        const upgradedCount = UPGRADED_TUNES.reduce(
            (s, t) => s + (garageCar.upgrades?.[t] || 0), 0
        );

        // Safety: if this car has no upgraded copies, force keep ≥ 1 stock
        // so we never delete the last reference to a model from the garage.
        let effectiveKeep = keepStock;
        if (upgradedCount === 0 && effectiveKeep < 1) {
            effectiveKeep = 1;
            modelsSafetyKept++;
        }

        const stockToSell = stockOwned - effectiveKeep;
        if (stockToSell <= 0) continue;

        const basePerCar = getSellPrice(car.cr);
        toSell.push({ carID: garageCar.carID, count: stockToSell, basePerCar });
        totalCount += stockToSell;
        totalMoney += basePerCar * stockToSell;
        perModelCount.set(garageCar.carID, stockToSell);
        modelsTouched++;
    }

    if (toSell.length === 0) {
        const filterDesc = describeFilters(filters) ? ` (${describeFilters(filters)})` : "";
        return new InfoMessage({
            channel: message.channel,
            title: `Nothing to sell — keeping ${keepStock} stock of each${filterDesc}.`,
            desc: "Either you have no eligible stock duplicates, every match is a prize / diamond / BM car (protected), or all stock copies are within the keep limit.",
            author: message.author
        }).sendMessage();
    }

    // ─── Build a "top sold" preview (cap at 8 lines for readability) ────────
    const topSold = [...perModelCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cid, n]) => {
            const c = getCar(cid);
            return `• **${n.toLocaleString()}×** ${carNameGen({ currentCar: c, rarity: true })}`;
        })
        .join("\n");
    const moreLine = perModelCount.size > 8
        ? `\n_…and ${(perModelCount.size - 8).toLocaleString()} more model(s)_`
        : "";

    // ─── Confirm ────────────────────────────────────────────────────────────
    const filterTag = describeFilters(filters) ? ` • ${describeFilters(filters)}` : "";
    const safetyNote = modelsSafetyKept > 0
        ? `\n\n_⚠️ ${modelsSafetyKept} model(s) had no upgraded copies and were kept at 1 stock as a safety net._`
        : "";

    const confirmationMessage = new InfoMessage({
        channel: message.channel,
        title: `Bulk-sell stock duplicates — keeping ${keepStock} of each?${filterTag}`,
        desc: `**${totalCount.toLocaleString()} stock cars** across **${modelsTouched.toLocaleString()} model(s)** will be sold for **${moneyEmoji}${totalMoney.toLocaleString("en")}**.\n\n_🔒 Upgraded copies (333+) are protected — never sold via bulk._${safetyNote}\n\n**Top by count:**\n${topSold}${moreLine}\n\n_This is irreversible._ ${defaultChoiceTime / 1000}s to confirm.`,
        author: message.author
    });

    try {
        await confirm(message, confirmationMessage, async (currentMessage) => {
            // ─── Apply ──────────────────────────────────────────────────────
            for (const op of toSell) {
                const garageCar = playerData.garage.find(g => g.carID === op.carID);
                if (!garageCar) continue;
                garageCar.upgrades["000"] = (garageCar.upgrades["000"] || 0) - op.count;
                // Only clear hand/decks for tune 000 if it fully zeroed out.
                if ((garageCar.upgrades["000"] || 0) === 0) {
                    updateHands(playerData, op.carID, "000", "remove");
                }
            }
            // Drop garage entries that have 0 across all tunes (rare — only if
            // the safety net was bypassed, which currently can't happen)
            playerData.garage = playerData.garage.filter(g => calcTotal(g) > 0);
            const newBalance = playerData.money + totalMoney;
            playerData.money = newBalance;

            await profileModel.updateOne({ userID: message.author.id }, {
                money: newBalance,
                garage: playerData.garage,
                hand: playerData.hand,
                decks: playerData.decks
            });

            trackMoneyEarned(totalMoney);
            trackCarsSold(totalCount);

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Sold ${totalCount.toLocaleString()} stock duplicate(s)!`,
                desc: `You earned **${moneyEmoji}${totalMoney.toLocaleString("en")}**.\n\n_All upgraded copies (333+) were preserved._`,
                author: message.author,
                fields: [
                    { name: "Models touched", value: modelsTouched.toLocaleString(), inline: true },
                    { name: "Stock kept", value: `${keepStock} of each`, inline: true },
                    { name: "New balance", value: `${moneyEmoji}${newBalance.toLocaleString("en")}`, inline: true }
                ]
            });
            await successMessage.sendMessage({ currentMessage });
            return successMessage.removeButtons();
        }, playerData.settings.buttonstyle);
    }
    catch (error) {
        throw error;
    }
}
