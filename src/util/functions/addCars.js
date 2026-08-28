"use strict";

const { carSave } = require("../consts/consts.js");

function addCars(garage, cars) {
    // TRIPWIRE + SELF-HEAL (2026-08-28): 7 live profiles were found carrying
    // DUPLICATE garage entries for the same carID — every known writer merges
    // through this function, so the duplicates' origin is still unidentified.
    // The Map below silently masks them (last entry wins, earlier siblings
    // stranded). Instead: merge duplicates into one entry, and log LOUDLY so
    // the next occurrence pinpoints when/where they are being born.
    const counts = new Map();
    for (const car of garage) {
        if (car && car.carID) counts.set(car.carID, (counts.get(car.carID) || 0) + 1);
    }
    const duped = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    if (duped.length > 0) {
        console.log(`[garage] DUPLICATE entries detected for ${duped.join(", ")} — merging. If this line appears, the write that created them happened recently; check surrounding logs.`);
        for (const id of duped) {
            const entries = garage.filter(car => car && car.carID === id);
            const primary = entries[0];
            for (const extra of entries.slice(1)) {
                for (const [tune, count] of Object.entries(extra.upgrades || {})) {
                    if (typeof count === "number" && count > 0) {
                        primary.upgrades[tune] = (primary.upgrades[tune] || 0) + count;
                    }
                }
                garage.splice(garage.indexOf(extra), 1);
            }
        }
    }

    // Create a map for quick lookups by carID
    const garageMap = new Map(garage.map(car => [car.carID, car]));

    for (const { carID, upgrade: rawUpgrade } of cars) {
        // A caller that omits `upgrade` used to file the car under the literal
        // key "undefined" — the player owned it, but in a tune slot that does
        // not exist, so it could not be raced, sold or filtered. Default to
        // stock instead. (Race Week rung prizes shipped without an upgrade;
        // every other reward source sets "000" explicitly.)
        const upgrade = Object.keys(carSave).includes(rawUpgrade) ? rawUpgrade : "000";
        const existingCar = garageMap.get(carID);

        if (existingCar) {
            // Heal corrupt legacy entries (missing/invalid upgrades object) —
            // an unguarded dereference here used to throw AFTER a pack's
            // reveal, silently voiding the whole opening.
            if (!existingCar.upgrades || typeof existingCar.upgrades !== "object") {
                const healed = {};
                for (const key of Object.keys(carSave)) {
                    healed[key] = 0;
                }
                existingCar.upgrades = healed;
            }
            // Increment upgrade count if car exists
            existingCar.upgrades[upgrade] = (existingCar.upgrades[upgrade] || 0) + 1;
        } else {
            // Create new car entry with zeroed upgrades, then set the pulled upgrade to 1
            const upgrades = {};
            for (const key of Object.keys(carSave)) {
                upgrades[key] = 0;
            }
            upgrades[upgrade] = 1;

            const newCar = { carID, upgrades };

            // Add to both map and garage
            garageMap.set(carID, newCar);
            garage.push(newCar);
        }
    }

    return garage;
}

module.exports = addCars;
