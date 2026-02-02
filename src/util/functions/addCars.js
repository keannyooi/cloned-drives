"use strict";

const { carSave } = require("../consts/consts.js");

function addCars(garage, cars) {
    // Create a map for quick lookups by carID
    const garageMap = new Map(garage.map(car => [car.carID, car]));

    for (const { carID, upgrade } of cars) {
        const existingCar = garageMap.get(carID);

        if (existingCar) {
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
