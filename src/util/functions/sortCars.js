"use strict";

const { getCar } = require("./dataManager.js");
const { calcTune } = require("./calcTune.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");

// Map sort keys to calcTune result keys
const sortKeyMap = {
    "topSpeed": "topSpeed",
    "0to60": "accel",
    "handling": "handling",
    "weight": "weight",
    "mra": "mra",
    "ola": "ola"
};

function sortCars(list, sort, order, garage) {
    return list.sort(function (a, b) {
        // Handle both string filenames and objects with carID
        let carIdA = typeof a === "string" ? (a.endsWith('.json') ? a.slice(0, -5) : a) : a.carID;
        let carIdB = typeof b === "string" ? (b.endsWith('.json') ? b.slice(0, -5) : b) : b.carID;
        
        let carA = getCar(carIdA);
        let carB = getCar(carIdB);
        
        // Get base reference for BM cars
        let bmRefA = carA["reference"] ? getCar(carA["reference"]) : carA;
        let bmRefB = carB["reference"] ? getCar(carB["reference"]) : carB;

        let critA, critB;
        
        // Check if this is a tunable stat (uses calcTune)
        if (sortKeyMap[sort]) {
            const tuneKey = sortKeyMap[sort];
            let checkOrder = ["333", "666", "699", "969", "996"];
            
            // Find the highest tune for each car
            let tuneA = "000";
            let tuneB = "000";
            
            // If we have upgrade info (from garage objects)
            if (a.upgrades) {
                for (let upg of checkOrder) {
                    if (a.upgrades[upg] > 0) {
                        tuneA = upg;
                    }
                }
            } else if (typeof a !== "string") {
                // Check for old-style direct tune properties
                for (let upg of checkOrder) {
                    if (a[upg] > 0) {
                        tuneA = upg;
                    }
                }
            }
            
            if (b.upgrades) {
                for (let upg of checkOrder) {
                    if (b.upgrades[upg] > 0) {
                        tuneB = upg;
                    }
                }
            } else if (typeof b !== "string") {
                for (let upg of checkOrder) {
                    if (b[upg] > 0) {
                        tuneB = upg;
                    }
                }
            }
            
            // Calculate tuned stats
            const statsA = calcTune(bmRefA, tuneA);
            const statsB = calcTune(bmRefB, tuneB);
            
            critA = statsA[tuneKey];
            critB = statsB[tuneKey];
        }
        else if (sort === "duplicates") {
            let upgA, upgB;
            if (garage) {
                const aId = typeof a === "string" ? (a.endsWith('.json') ? a.slice(0, -5) : a.slice(0, 6)) : a.carID;
                const bId = typeof b === "string" ? (b.endsWith('.json') ? b.slice(0, -5) : b.slice(0, 6)) : b.carID;
                upgA = garage.find(c => aId.includes(c.carID));
                upgB = garage.find(c => bId.includes(c.carID));
            }

            if (upgA === 0 && upgB === 0) {
                critA = critB = 0;
            }
            else {
                critA = calcTotal(upgA ?? a);
                critB = calcTotal(upgB ?? b);
            }
        }
        else {
            // Non-tunable stats (cr, driveType, etc.) - use base car values
            critA = bmRefA[sort];
            critB = bmRefB[sort];
        }

        if (critA === critB) {
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        else {
            // Lower is better for: 0-60, weight, ola (lower = faster launch)
            let lowerIsBetter = (sort === "0to60" || sort === "weight" || sort === "ola");
            if ((order === "ascending") ? !lowerIsBetter : lowerIsBetter) {
                return critA - critB;
            }
            else {
                return critB - critA;
            }
        }
    });
}

module.exports = sortCars;
