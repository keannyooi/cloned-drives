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
            // Create new car entry with default upgrades
            const upgrades = { ...carSave, [upgrade]: 1 };
            upgrades["000"] = upgrades["000"] || 0; // Ensure "000" is initialized
            const newCar = { carID, upgrades };

            // Add to both map and garage
            garageMap.set(carID, newCar);
            garage.push(newCar);
        }
    }

    return garage;
}

module.exports = addCars;