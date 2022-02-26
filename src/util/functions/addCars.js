"use strict";

const { carSave } = require("../consts/consts.js");

function addCars(garage, cars) {
    for (let { carID, upgrade } of cars) {
        let isInGarage = garage.findIndex(garageCar => garageCar.carID === carID);
        if (isInGarage !== -1) {
            garage[isInGarage].upgrades[upgrade] += 1;
        }
        else {
            let upgrades = Object.assign({}, carSave);
            upgrades["000"] = 0;
            upgrades[upgrade] = 1;
            garage.push({
                carID: carID,
                upgrades
            });
        }
    }
    return garage;
}

module.exports = addCars;