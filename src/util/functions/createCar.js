"use strict";

const carNameGen = require("./carNameGen.js");
const unbritish = require("./unbritish.js");

function createCar(currentCar, unitPreference, hideStats) {
    let car = require(`../../cars/${currentCar.carID}.json`), bmReference = car;
    if (car["reference"]) {
        bmReference = require(`../../cars/${car["reference"]}.json`)
    }
    const carModule = {
        rq: bmReference["rq"],
        topSpeed: bmReference["topSpeed"],
        accel: bmReference["0to60"],
        handling: bmReference["handling"],
        driveType: bmReference["driveType"],
        tyreType: bmReference["tyreType"],
        weight: bmReference["weight"],
        enginePos: bmReference["enginePos"],
        gc: bmReference["gc"],
        tcs: bmReference["tcs"],
        abs: bmReference["abs"],
        mra: bmReference["mra"],
        ola: bmReference["ola"],
        racehud: car["racehud"],
        isBM: (car["reference"] !== undefined)
    };
    if (currentCar.upgrade !== "000") {
        carModule.topSpeed = bmReference[`${currentCar.upgrade}TopSpeed`];
        carModule.accel = bmReference[`${currentCar.upgrade}0to60`];
        carModule.handling = bmReference[`${currentCar.upgrade}Handling`];
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
            carSpecs += `Weight: ${carModule.weight.toLocaleString("en")}kg (${unbritish(carModule.weight, "weight").toLocaleString("en")}lbs)\n`;
        }
        else {
            carSpecs += `Weight: ${carModule.weight.toLocaleString("en")}kg\n`;
        }

        carSpecs += `Ground Clearance: ${carModule.gc}
        ${carModule.tcs ? "✅" : "❌"} TCS, ${carModule.abs ? "✅" : "❌"} ABS\n`;
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