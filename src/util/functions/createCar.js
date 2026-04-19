"use strict";

const { getCar } = require("./dataManager.js");
const { calcTune } = require("./calcTune.js");
const carNameGen = require("./carNameGen.js");
const unbritish = require("./unbritish.js");

function createCar(currentCar, unitPreference, hideStats) {
    let car = getCar(currentCar.carID), bmReference = car;
    if (car["reference"]) {
        bmReference = getCar(car["reference"]);
    }
    
    // Get tuned stats via calculation (handles all 6 stats)
    const tune = currentCar.upgrade || "000";
    const tunedStats = calcTune(bmReference, tune);
    
    const carModule = {
        cr: bmReference["cr"],
        topSpeed: tunedStats.topSpeed,
        accel: tunedStats.accel,
        handling: tunedStats.handling,
        driveType: bmReference["driveType"],
        tyreType: bmReference["tyreType"],
        weight: tunedStats.weight,
        enginePos: bmReference["enginePos"],
        gc: bmReference["gc"],
        tcs: bmReference["tcs"],
        abs: bmReference["abs"],
        mra: tunedStats.mra,
        ola: tunedStats.ola,
        racehud: car["racehud"],
        isBM: (car["reference"] !== undefined),
        isDiamond: (car["diamond"] === true)
    };

    let carSpecs = carNameGen({ currentCar: car, rarity: true, upgrade: tune });
    if (!hideStats) {
        if (unitPreference === "metric") {
            carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH (${unbritish(carModule.topSpeed, "topSpeed")}KM/H)\n`;
        }
        else {
            carSpecs += `\nTop Speed: ${carModule.topSpeed}MPH\n`;
        }
        if (carModule.topSpeed < 60) {
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
            const weightKg = carModule.weight !== undefined ? carModule.weight.toLocaleString("en") : "N/A";
            const weightLbs = carModule.weight !== undefined ? unbritish(carModule.weight, "weight").toLocaleString("en") : "N/A";
            carSpecs += `Weight: ${weightKg}kg (${weightLbs}lbs)\n`;
        } else {
            const weightKg = carModule.weight !== undefined ? carModule.weight.toLocaleString("en") : "N/A";
            carSpecs += `Weight: ${weightKg}kg\n`;
        }

        carSpecs += `Ground Clearance: ${carModule.gc}
        ${carModule.tcs ? "✅" : "❌"} TCS, ${carModule.abs ? "✅" : "❌"} ABS\n`;
        
        if (carModule.topSpeed < 100) {
            carSpecs += "MRA: N/A\n";
        }
        else {
            carSpecs += `MRA: ${carModule.mra}\n`;
        }
        if (carModule.topSpeed < 30) {
            carSpecs += "OLA: N/A\n";
        }
        else {
            carSpecs += `OLA: ${carModule.ola}\n`;
        }
    }

    return [carModule, carSpecs];
}

module.exports = createCar;
