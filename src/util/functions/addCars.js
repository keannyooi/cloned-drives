"use strict";

const { carSave } = require("../consts/consts.js");

function addCars(garage, cars) {
    for (let { carID, upgrade } of cars) {
        let isInGarage = garage.findIndex(garageCar => garageCar.carID === carID);
		//console.log("Adding car with ID:", carID, "and upgrade:", upgrade);
        //console.log("Current garage:", garage);
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
		//console.log("Updated Garage:", garage);
    }
    return garage;
}

module.exports = addCars;