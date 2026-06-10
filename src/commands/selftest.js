"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { getAllCars, getCar, getPack, getPackFiles } = require("../util/functions/dataManager.js");
const {
    getBaseType, getCardTypes, hasType, deriveLegacyTypes,
    isPackable, isDiamondCar, isDiamondRollable, inBMRotation, inDealershipPool, inDailyGiftPool,
    rrOpponentClass, isSellProtected, exchangePool, isPrizeLike, isBMCar, usesReferenceStats,
    sellValueMult, modifiedBase, effectiveStats, validateCardModifiers, TYPE_NAMES
} = require("../util/functions/cardType.js");
const { calcTune } = require("../util/functions/calcTune.js");
const carNameGen = require("../util/functions/carNameGen.js");
const rarityCheck = require("../util/functions/rarityCheck.js");
const createCar = require("../util/functions/createCar.js");
const filterCheck = require("../util/functions/filterCheck.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");

/**
 * cd-selftest — post-refactor health check for the cardType system.
 *
 * Runs the full verification suite live, inside the real bot runtime:
 *   cd-selftest          → all silent checks, one report embed
 *   cd-selftest garage   → additionally scan every player garage (read-only)
 *   cd-selftest pack [p] → additionally open a pack in TEST mode (no garage writes)
 *
 * The flag-equivalence section doubles as a permanent data linter: any future
 * car JSON with a weird flag combination will turn a line red here.
 */
module.exports = {
    name: "selftest",
    usage: ["(no arguments)", "garage", "pack [pack ID]"],
    args: 0,
    category: "Admin",
    description: "Runs cardType system self-tests against live data. Read-only (pack mode uses test openings).",
    async execute(message, args) {
        const mode = (args[0] || "").toLowerCase();
        const results = [];
        const allCars = getAllCars();

        function check(name, fn) {
            try {
                const detail = fn(); // throw or return a string to fail, return undefined/true to pass
                if (typeof detail === "string") results.push({ name, pass: false, detail });
                else results.push({ name, pass: true });
            } catch (err) {
                results.push({ name, pass: false, detail: err.message.slice(0, 150) });
            }
        }

        // ─── 1. Type resolution over every car ──────────────────────────────
        const census = {};
        check("every car resolves to a known type", () => {
            const unknown = [];
            for (const car of allCars) {
                const t = getBaseType(car);
                census[t] = (census[t] || 0) + 1;
                if (!TYPE_NAMES.includes(t)) unknown.push(`${car.carID}:${t}`);
            }
            if (unknown.length) return `${unknown.length} unknown: ${unknown.slice(0, 5).join(", ")}`;
        });

        // ─── 2. Predicate ↔ flag equivalence (per the agreed matrix) ────────
        // While cars still carry legacy flags, the predicates (which read the
        // explicit cardType when present) must agree with what the flags say —
        // this catches both bad flag combos AND a hand-edited cardType that
        // disagrees with its flags. Cars with no legacy flags at all are
        // post-flag-era and skipped.
        const anomalies = {};
        function expect(car, name, actual, expected) {
            if (actual !== expected) {
                anomalies[name] = anomalies[name] || [];
                anomalies[name].push(car.carID);
            }
        }
        check("predicates match legacy flags (data linter)", () => {
            for (const car of allCars) {
                const hasLegacyFlags = car.isPrize !== undefined || car.reference !== undefined
                    || car.diamond !== undefined || car.active !== undefined;
                if (!hasLegacyFlags) continue;
                if (car.cardType) {
                    expect(car, "cardType≡flags", getBaseType(car), deriveLegacyTypes(car)[0]);
                }
                const ref = !!car.reference, prize = car.isPrize === true,
                    dia = car.diamond === true, bossCR = (car.cr || 0) > 1500;
                expect(car, "isPackable", isPackable(car), !(ref || prize || dia));
                expect(car, "isDiamondCar", isDiamondCar(car), dia && !ref);
                expect(car, "isDiamondRollable", isDiamondRollable(car), dia && !ref && car.active !== false && !prize);
                expect(car, "inDailyGiftPool", inDailyGiftPool(car), !(ref || prize || dia));
                expect(car, "inDealershipPool", inDealershipPool(car), !(ref || prize || dia));
                expect(car, "isSellProtected", isSellProtected(car), prize || ref || dia);
                expect(car, "inBMRotation", inBMRotation(car), ref && car.active === true);
                expect(car, "exchange:prize", exchangePool(car) === "prize", prize && !ref && !dia && !bossCR);
                expect(car, "exchange:diamond", exchangePool(car) === "diamond", dia && !ref);
                expect(car, "rr:boss", rrOpponentClass(car) === "boss", prize && bossCR);
                expect(car, "rr:normal", rrOpponentClass(car) === "normal", !ref && !dia && !(prize && bossCR));
                expect(car, "isPrizeLike", isPrizeLike(car), prize);
                expect(car, "sellValueMult=1", sellValueMult(car), 1);
            }
            const broken = Object.entries(anomalies);
            if (broken.length) {
                return broken.map(([k, ids]) => `${k}: ${ids.length} (${ids.slice(0, 3).join(",")})`).join(" | ").slice(0, 400);
            }
        });

        // ─── 3. Pool sanity counts ──────────────────────────────────────────
        const counts = {
            packable: allCars.filter(isPackable).length,
            dealership: allCars.filter(inDealershipPool).length,
            dailyGift: allCars.filter(c => inDailyGiftPool(c) && (c.cr || 0) <= 699).length,
            bmRotation: allCars.filter(inBMRotation).length,
            bossPool: allCars.filter(c => rrOpponentClass(c) === "boss").length,
            prizeExchange: allCars.filter(c => exchangePool(c) === "prize").length
        };
        check("acquisition pools are non-empty and consistent", () => {
            if (counts.packable === 0) return "packable pool is EMPTY";
            if (counts.dailyGift === 0) return "daily gift pool is EMPTY";
            if (counts.bmRotation !== (census.ABM || 0)) return `bmRotation ${counts.bmRotation} ≠ ABM census ${census.ABM || 0}`;
            if (counts.bossPool !== (census.BOSS || 0)) return `boss pool ${counts.bossPool} ≠ BOSS census ${census.BOSS || 0}`;
            if (counts.prizeExchange !== (census.Prize || 0)) return `prize exchange ${counts.prizeExchange} ≠ Prize census ${census.Prize || 0}`;
        });

        // ─── 4. Live display chain (emoji cache, name tags) ─────────────────
        const sample = {};
        for (const t of ["Normal", "Prize", "ABM", "IBM", "BOSS"]) {
            sample[t] = allCars.find(c => getBaseType(c) === t);
        }
        check("carNameGen renders every type without errors", () => {
            const problems = [];
            for (const [t, car] of Object.entries(sample)) {
                if (!car) continue;
                const name = carNameGen({ currentCar: car, rarity: true });
                if (!name || name.includes("undefined")) problems.push(`${t}: "${name}"`);
                if (t === "ABM" && !name.includes("🟢")) problems.push("ABM missing 🟢");
                if (t === "IBM" && !name.includes("🔴")) problems.push("IBM missing 🔴");
            }
            if (problems.length) return problems.join(" | ").slice(0, 300);
        });
        check("rarityCheck returns an emoji for every type", () => {
            const missing = [];
            for (const [t, car] of Object.entries(sample)) {
                if (!car) continue;
                if (!rarityCheck(modifiedBase(car), isBMCar(car) ? "bm" : null)) missing.push(t);
            }
            if (missing.length) return `no emoji for: ${missing.join(", ")}`;
        });

        // ─── 5. createCar stat identity (BM cards race as their base) ───────
        check("createCar: BM card carries its reference car's stats", () => {
            const bm = sample.ABM || sample.IBM;
            if (!bm) return; // no BM cars in data — nothing to test
            const base = getCar(bm.reference);
            const [carModule] = createCar({ carID: bm.carID, upgrade: "000" });
            const tuned = calcTune(base, "000");
            if (carModule.cr !== base.cr) return `cr ${carModule.cr} ≠ base ${base.cr}`;
            if (carModule.topSpeed !== tuned.topSpeed) return `topSpeed ${carModule.topSpeed} ≠ ${tuned.topSpeed}`;
            if (carModule.isBM !== true) return "isBM flag lost";
        });
        check("createCar: normal car keeps its own stats", () => {
            const car = sample.Normal;
            const [carModule] = createCar({ carID: car.carID, upgrade: "000" });
            const tuned = calcTune(car, "000");
            if (carModule.cr !== car.cr) return `cr ${carModule.cr} ≠ ${car.cr}`;
            if (carModule.topSpeed !== tuned.topSpeed) return `topSpeed mismatch`;
            if (carModule.isBM !== false) return "normal car flagged as BM";
        });

        // ─── 6. filterCheck through the new chain ───────────────────────────
        check("filterCheck: isPrize / isBM / CR-range behavior", () => {
            const problems = [];
            const norm = sample.Normal, bm = sample.ABM || sample.IBM, boss = sample.BOSS, prize = sample.Prize;
            if (filterCheck({ car: { carID: norm.carID }, filter: { isPrize: true } })) problems.push("normal matched isPrize:true");
            if (prize && !filterCheck({ car: { carID: prize.carID }, filter: { isPrize: true } })) problems.push("prize failed isPrize:true");
            if (boss && !filterCheck({ car: { carID: boss.carID }, filter: { isPrize: true } })) problems.push("BOSS failed isPrize:true");
            if (bm) {
                if (!filterCheck({ car: { carID: bm.carID }, filter: { isBM: true } })) problems.push("BM failed isBM:true");
                const baseCr = getCar(bm.reference).cr;
                if (!filterCheck({ car: { carID: bm.carID }, filter: { cr: { start: baseCr, end: baseCr } } })) problems.push("BM cr-range not using base CR");
                const bmType = getBaseType(getCar(bm.carID)).toLowerCase();
                if (!filterCheck({ car: { carID: bm.carID }, filter: { cardType: [bmType] } })) problems.push(`BM failed cardType:[${bmType}]`);
                if (filterCheck({ car: { carID: norm.carID }, filter: { cardType: [bmType] } })) problems.push("normal matched a BM cardType filter");
            }
            if (problems.length) return problems.join(" | ");
        });

        // ─── 7. Per-card modifier engine (synthetic card, no data touched) ──
        check("modifier engine: stats, overrides, validator", () => {
            const bm = sample.ABM || sample.IBM;
            if (!bm) return;
            const base = getCar(bm.reference);
            const works = {
                carID: "cSELFTEST", cardType: ["ABM"], reference: bm.reference,
                statModifiers: { topSpeed: "+5%" }, attributeOverrides: { tyreType: "Slick" }, crModifier: 25
            };
            const eff = effectiveStats(works, "000");
            if (eff.topSpeed <= base.topSpeed) return "+5% topSpeed not applied";
            if (eff.tyreType !== "Slick") return "tyre override not applied";
            if (eff.cr !== base.cr + 25) return "crModifier not applied";
            const issues = validateCardModifiers({ carID: "cBAD", cardType: ["ABM"], reference: bm.reference, statModifiers: { topSped: "+5", mra: "5mph" } });
            if (issues.length !== 2) return `validator found ${issues.length} issues, expected 2`;
        });

        // ─── Optional deep modes ─────────────────────────────────────────────
        if (mode === "garage") {
            const scanning = new InfoMessage({
                channel: message.channel,
                title: "Scanning player garages... (streamed, this may take a moment)",
                author: message.author
            });
            await scanning.sendMessage();

            // Stream profiles in small batches — loading every garage at once
            // blows the heap on a player base this size.
            let profileCount = 0, entries = 0, danglingCount = 0;
            const danglingSamples = [];
            const cursor = profileModel.find({}, "userID garage").lean().batchSize(25).cursor();
            for await (const p of cursor) {
                profileCount++;
                for (const g of (p.garage || [])) {
                    entries++;
                    if (!getCar(g.carID)) {
                        danglingCount++;
                        if (danglingSamples.length < 25) danglingSamples.push(`${p.userID}: ${g.carID}`);
                    }
                }
            }
            check(`garage scan: ${profileCount.toLocaleString()} profiles, ${entries.toLocaleString()} entries`, () => {
                if (danglingCount) return `${danglingCount} dangling carIDs (fail-safe locked, but worth cleaning): ${danglingSamples.slice(0, 8).join(", ")}`;
            });
        }

        // ─── Report ──────────────────────────────────────────────────────────
        const failed = results.filter(r => !r.pass);
        const lines = results.map(r => `${r.pass ? "✅" : "❌"} ${r.name}${r.pass ? "" : `\n      ↳ ${r.detail}`}`).join("\n");
        const censusLine = Object.entries(census).map(([k, v]) => `${k} ${v}`).join(" | ");
        const poolLine = `packable ${counts.packable} | dealer ${counts.dealership} | gift ${counts.dailyGift} | BM rotation ${counts.bmRotation} | boss ${counts.bossPool} | prize-exch ${counts.prizeExchange}`;

        const MessageClass = failed.length === 0 ? SuccessMessage : ErrorMessage;
        const report = new MessageClass({
            channel: message.channel,
            title: failed.length === 0
                ? `Self-test passed — ${results.length}/${results.length} checks ✅`
                : `Self-test: ${failed.length} of ${results.length} checks FAILED`,
            desc: lines.slice(0, 3900),
            author: message.author,
            fields: [
                { name: "Type census", value: censusLine.slice(0, 1024) },
                { name: "Pools", value: poolLine.slice(0, 1024) }
            ],
            footer: "Read-only. Run `cd-selftest garage` for a player-data scan, `cd-selftest pack [id]` for a test pack opening."
        });
        await report.sendMessage();

        // Test-mode pack opening LAST so the report isn't buried by the reveal
        if (mode === "pack") {
            let packID = args[1];
            if (!packID) {
                packID = getPackFiles().map(f => f.slice(0, 6))
                    .filter(id => typeof getPack(id)?.price === "number" && getPack(id).price > 0)
                    .sort((a, b) => getPack(a).price - getPack(b).price)[0];
            }
            const currentPack = getPack(packID);
            if (!currentPack) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: `Error, pack ${packID} not found.`,
                    author: message.author
                }).sendMessage();
            }
            const intro = new InfoMessage({
                channel: message.channel,
                title: `Test-opening ${currentPack.packName} (no garage changes, no charge)...`,
                author: message.author
            });
            await intro.sendMessage();
            await openPack({ message, currentPack, test: true });
        }
    }
};
