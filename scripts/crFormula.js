"use strict";

/**
 * CR FORMULA — CLI over src/util/functions/crFormula.js (the formula itself
 * lives there so the bot can use it at runtime; see docs/cr-formula.md).
 *
 *   node scripts/crFormula.js            checks every live car against the formula
 *   node scripts/crFormula.js c01234     prints the breakdown for one car
 *
 *   const { computeCR } = require("../src/util/functions/crFormula.js");
 *   computeCR(carObject) -> integer CR (or null if a stat is missing)
 */

const path = require("path");
const ROOT = path.join(__dirname, "..");
const formula = require(path.join(ROOT, "src/util/functions/crFormula.js"));
const { computeCR, breakdown } = formula;

module.exports = formula;

// ── CLI: verify against the live roster, or explain one car ─────────────────
if (require.main === module) {
    process.chdir(ROOT);
    require(path.join(ROOT, "src/config/config.js"));
    const dm = require(path.join(ROOT, "src/util/functions/dataManager.js"));
    dm.initialize("./src");
    const { isBMCar } = require(path.join(ROOT, "src/util/functions/cardType.js"));
    const name = c => `${Array.isArray(c.make) ? c.make[0] : c.make} ${c.model} (${c.modelYear})`;
    const arg = process.argv[2];
    if (arg) {
        const car = dm.getCar(arg.toLowerCase());
        if (!car) { console.log("no such car"); process.exit(1); }
        const b = breakdown(car);
        console.log(`${name(car)} — file cr ${car.cr}, formula cr ${b.cr} (${b.isDrag ? "drag" : "normal"} variant)`);
        for (const [k, v] of Object.entries(b.terms)) console.log(`  ${k.padEnd(10)} ${(v >= 0 ? "+" : "") + v.toFixed(3)} pts  (${Math.round(v * 10)} CR)`);
        process.exit(0);
    }
    let exact = 0, within1 = 0, within5 = 0, off = [], skipped = 0, n = 0;
    for (const file of dm.getCarFiles()) {
        const car = dm.getCar(file.slice(0, 6));
        if (!car || isBMCar(car) || typeof car.cr !== "number") continue;
        const b = breakdown(car);
        if (!b) { skipped++; continue; }
        n++;
        const d = Math.abs(b.cr - car.cr);
        if (d === 0) exact++; else if (d <= 1) within1++; else if (d <= 5) within5++; else off.push({ car, formula: b.cr, isDrag: b.isDrag });
    }
    console.log(`live base cars: ${n} (skipped ${skipped} with missing stats)`);
    console.log(`exact match ${exact} (${(exact / n * 100).toFixed(1)}%) | within 1: ${within1} | within 5: ${within5} | off by >5: ${off.length}`);
    off.sort((a, b) => Math.abs(b.formula - b.car.cr) - Math.abs(a.formula - a.car.cr));
    console.log("largest disagreements (file cr vs formula):");
    off.slice(0, 15).forEach(o => console.log(`  ${name(o.car).padEnd(50)} file ${String(o.car.cr).padStart(5)}  formula ${String(o.formula).padStart(5)}  (${o.formula - o.car.cr > 0 ? "+" : ""}${o.formula - o.car.cr})${o.isDrag ? "  [drag]" : ""}`));
    const dragOff = off.filter(o => o.isDrag).length, dragAll = [...dm.getCarFiles()].filter(f => { const c = dm.getCar(f.slice(0, 6)); return c && !isBMCar(c) && c.tyreType === "Drag"; }).length;
    console.log(`drag cars: ${dragAll} total, ${dragOff} off by >5`);
    void computeCR;
}
