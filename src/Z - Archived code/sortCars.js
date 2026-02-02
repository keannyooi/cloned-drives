"use strict";

const { getCar } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const calcTotal = require("./calcTotal.js");

function sortCars(list, sort, order, garage) {
    return list.sort(function (a, b) {
        // Handle both string filenames and objects with carID
        let carIdA = typeof a === "string" ? (a.endsWith('.json') ? a.slice(0, -5) : a) : a.carID;
        let carIdB = typeof b === "string" ? (b.endsWith('.json') ? b.slice(0, -5) : b) : b.carID;
        
        let carA = getCar(carIdA);
        let carB = getCar(carIdB);
        if (carA["reference"]) {
            carA = getCar(carA["reference"]);
        }
        if (carB["reference"]) {
            carB = getCar(carB["reference"]);
        }

        let critA = carA[sort], critB = carB[sort];
        if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
            let checkOrder = ["333", "666", "699", "969", "996"];
            let format = sort.charAt(0).toUpperCase() + sort.slice(1);
            for (let upg of checkOrder) {
                if (a[upg] > 0) {
                    critA = carA[`${upg}${format}`];
                }
                if (b[upg] > 0) {
                    critB = carB[`${upg}${format}`];
                }
            }
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

        if (critA === critB) {
            return carNameGen({ currentCar: carA }) > carNameGen({ currentCar: carB }) ? 1 : -1;
        }
        else {
            let someBool = (sort === "0to60" || sort === "weight" || sort === "ola");
            if ((order === "ascending") ? !someBool : someBool) { //basically a logical XOR gate
                return critA - critB;
            }
            else {
                return critB - critA;
            }
        }
    });
}

module.exports = sortCars;
