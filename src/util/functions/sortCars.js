"use strict";

const carNameGen = require("./carNameGen.js");

function sortCars(list, sort, order, garage) {
    return list.sort(function (a, b) {
        let carA = require(`../../cars/${typeof a === "string" ? a : a.carID}`);
        let carB = require(`../../cars/${typeof b === "string" ? b : b.carID}`);

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
                upgA = garage.find(c => a.includes(c.carID));
                upgB = garage.find(c => b.includes(c.carID));
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