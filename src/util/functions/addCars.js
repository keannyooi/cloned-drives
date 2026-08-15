"use strict";

const { carSave } = require("../consts/consts.js");

function addCars(garage, cars) {
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
