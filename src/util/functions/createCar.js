"use strict";

const carNameGen = require("./carNameGen.js");
const unbritish = require("./unbritish.js");

function createCar(currentCar, unitPreference, hideStats) {
    const car = require(`../../cars/${currentCar.carID}.json`);
    const carModule = {
        rq: car["rq"],
        topSpeed: car["topSpeed"],
        accel: car["0to60"],
        handling: car["handling"],
        driveType: car["driveType"],
        tyreType: car["tyreType"],
        weight: car["weight"],
        enginePos: car["enginePos"],
        gc: car["gc"],
        tcs: car["tcs"],
        abs: car["abs"],
        mra: car["mra"],
        ola: car["ola"],
        racehud: car["racehud"]
    };
    if (currentCar.upgrade !== "000") {
        carModule.topSpeed = car[`${currentCar.upgrade}TopSpeed`];
        carModule.accel = car[`${currentCar.upgrade}0to60`];
        carModule.handling = car[`${currentCar.upgrade}Handling`];
    }

    let carSpecs = carNameGen({ currentCar: car, rarity: true, upgrade: currentCar.upgrade });
    if (!hideStats) {
        if (unitPreference === "metric") {
            carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH (${unbritish(carModule.topSpeed, "topSpeed")}KM/H)\n`;
        }
        else {
            carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH\n`;
        }
        if (carModule.topSpeed < 60) {
            carModule.accel = 99.9;
            carSpecs += "0-60MPH: N/A\n";
        }
        else {
            if (unitPreference === "metric") {
                carSpecs += `0-60MPH: ${carModule.accel} sec (0-100KM/H: ${unbritish(carModule.accel, "0to60")} sec)\n`;
            }
            else {
                carSpecs += `0-60MPH: ${carModule.accel} sec\n`;
            }
        }

        carSpecs += `Handling: ${carModule.handling}
        ${carModule.enginePos} Engine, ${carModule.driveType}
        ${carModule.tyreType} Tyres\n`;
        if (unitPreference === "imperial") {
            carSpecs += `Weight: ${carModule.weight}kg (${unbritish(carModule.weight, "weight")}lbs)\n`;
        }
        else {
            carSpecs += `Weight: ${carModule.weight}kg\n`;
        }

        carSpecs += `Ground Clearance: ${carModule.gc}
        ${carModule.tcs ? "✅" : "❎"} TCS, ${carModule.abs ? "✅" : "❎"} ABS\n`;
        if (carModule.topSpeed < 100) {
            carModule.mra = 0;
            carSpecs += "MRA: N/A\n";
        }
        else {
            carSpecs += `MRA: ${carModule.mra}\n`;
        }
        if (carModule.topSpeed < 30) {
            carModule.ola = 0;
            carSpecs += "OLA: N/A\n";
        }
        else {
            carSpecs += `OLA: ${carModule.ola}\n`;
        }
    }

    return [carModule, carSpecs];
}

module.exports = createCar;