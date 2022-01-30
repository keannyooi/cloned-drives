"use strict";

const { weatherVars, driveHierarchy, gcHierarchy } = require("./sharedfiles/consts.js");
const bot = require("../config.js");
const { InfoMessage } = require("./sharedfiles/classes.js");

module.exports = {
    name: "benchmark",
    usage: [],
    args: 0,
    category: "Testing",
    description: "A test command for benchmark tests. May also be repurposed for testing throwaway code.",
    execute(message) {
        //setup
        const player = createCar({ carID: "c01130", upgrade: "996" });
        const opponent = createCar({ carID: "c00496", upgrade: "333" });
        const track = require("./tracks/t00020.json");
        
        // test condition 1
        const test1Start = performance.now();
        function compare(player, opponent, track, playerWon) {
            const { tyrePen } = weatherVars[`${track["weather"]} ${track["surface"]}`];
            const comparison = {
                "topSpeed": player.topSpeed - opponent.topSpeed,
                "0to60": opponent.accel - player.accel,
                "handling": player.handling - opponent.handling,
                "weight": opponent.weight - player.weight,
                "mra": player.mra - opponent.mra,
                "ola": opponent.ola - player.ola,
                "gc": gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc),
                "driveType": driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType),
                "tyreType": (tyrePen[opponent.tyreType] - tyrePen[player.tyreType]) ?? 0,
                "abs": player.abs - opponent.abs,
                "tcs": player.tcs - opponent.tcs
            };
            let response = "";
            //console.log(comparison);
        
            for (let [key, value] of Object.entries(comparison)) {
                const compareValue = track["specsDistr"][key];
                if (!playerWon) {
                    if (value > 0) {
                        value -= value * 2;
                    }
                    else {
                        value = Math.abs(value);
                    }
                }
        
                if (compareValue !== undefined && compareValue > 0 && value > 0) {
                    switch (key) {
                        case "topSpeed":
                            response += "Higher top speed, ";
                            break;
                        case "0to60":
                            response += "Lower 0-60, ";
                            break;
                        case "handling":
                            response += "Better handling, ";
                            break;
                        case "weight":
                            response += "Lower mass, ";
                            break;
                        case "mra":
                            response += "Better mid-range acceleration, ";
                            break;
                        case "ola":
                            response += "Better off-the-line acceleration, ";
                            break;
                        default:
                            break;
                    }
                }
                else if (value > 0) {
                    switch (key) {
                        case "gc":
                            if (track["humps"] > 0) {
                                response += "Higher ground clearance, ";
                            }
                            else if (track["speedbumps"] > 0 && (opponent.gc === "Low" || player.gc === "Low")) {
                                response += "Higher ground clearance, ";
                            }
                            break;
                        case "driveType":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                response += "Better drive system for the surface conditions, ";
                            }
                            break;
                        case "tyreType":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                response += "Better tyres for the surface conditions, ";
                            }
                            break;
                        case "abs":
                            if ((track["surface"] !== "Asphalt" || track["weather"] === "Rainy") && track["specsDistr"]["handling"] > 0) {
                                response += "ABS, ";
                            }
                            break;
                        case "tcs":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                response += "Traction Control, ";
                            }
                            break;
                        default:
                            break;
                    }
                }
            }
            if (response === "") {
                return "Sorry, we have no idea how you won/lost.";
            }
            else {
                return response.slice(0, -2);
            }
        }
        for (let i = 0; i < 10000; i++) {
            let test = compare(player, opponent, track, true);
        }
        const test1End = performance.now();

        // test condition 2
        const test2Start = performance.now();
        function compare2(player, opponent, track, playerWon) {
            const { tyrePen } = weatherVars[`${track["weather"]} ${track["surface"]}`];
            const comparison = {
                "topSpeed": player.topSpeed - opponent.topSpeed,
                "0to60": opponent.accel - player.accel,
                "handling": player.handling - opponent.handling,
                "weight": opponent.weight - player.weight,
                "mra": player.mra - opponent.mra,
                "ola": opponent.ola - player.ola,
                "gc": gcHierarchy.indexOf(opponent.gc) - gcHierarchy.indexOf(player.gc),
                "driveType": driveHierarchy.indexOf(opponent.driveType) - driveHierarchy.indexOf(player.driveType),
                "tyreType": (tyrePen[opponent.tyreType] - tyrePen[player.tyreType]) ?? 0,
                "abs": player.abs - opponent.abs,
                "tcs": player.tcs - opponent.tcs
            };
            let responseArray = [];
            //console.log(comparison);
        
            for (let [key, value] of Object.entries(comparison)) {
                const compareValue = track["specsDistr"][key];
                if (!playerWon) {
                    if (value > 0) {
                        value -= value * 2;
                    }
                    else {
                        value = Math.abs(value);
                    }
                }
        
                if (compareValue !== undefined && compareValue > 0 && value > 0) {
                    switch (key) {
                        case "topSpeed":
                            responseArray.push("Higher top speed");
                            break;
                        case "0to60":
                            responseArray.push("Lower 0-60");
                            break;
                        case "handling":
                            responseArray.push("Better handling");
                            break;
                        case "weight":
                            responseArray.push("Lower mass");
                            break;
                        case "mra":
                            responseArray.push("Better mid-range acceleration");
                            break;
                        case "ola":
                            responseArray.push("Better off-the-line acceleration");
                            break;
                        default:
                            break;
                    }
                }
                else if (value > 0) {
                    switch (key) {
                        case "gc":
                            if (track["humps"] > 0) {
                                responseArray.push("Higher ground clearance");
                            }
                            else if (track["speedbumps"] > 0 && (opponent.gc === "Low" || player.gc === "Low")) {
                                responseArray.push("Higher ground clearance");
                            }
                            break;
                        case "driveType":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                responseArray.push("Better drive system for the surface conditions");
                            }
                            break;
                        case "tyreType":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                responseArray.push("Better tyres for the surface conditions");
                            }
                            break;
                        case "abs":
                            if ((track["surface"] !== "Asphalt" || track["weather"] === "Rainy") && track["specsDistr"]["handling"] > 0) {
                                responseArray.push("ABS");
                            }
                            break;
                        case "tcs":
                            if (track["surface"] !== "Asphalt" || track["weather"] === "Rainy") {
                                responseArray.push("Traction Control");
                            }
                            break;
                        default:
                            break;
                    }
                }
            }
            if (responseArray.length > 0) {
                return responseArray.join(", ");
            }
            else {
                return "Sorry, we have no idea how you won/lost.";
            }
        }

        for (let i = 0; i < 10000; i++) {
            let test = compare2(player, opponent, track, true);
        }
        const test2End = performance.now();

        const resultMessage = new InfoMessage({
            channel: message.channel,
            title: "Benchmark test complete!",
            author: message.author,
            fields: [
                { name: "Test Condition 1", value: `\`${(test1End - test1Start).toFixed(3)}ms\``, inline: true },
                { name: "Test Condition 2", value: `\`${(test2End - test2Start).toFixed(3)}ms\``, inline: true }
            ]
        });
        return resultMessage.sendMessage();

        //additional functions
        function createCar(currentCar) {
            const car = require(`./cars/${currentCar.carID}.json`);
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
                racehud: car[`racehud${currentCar.upgrade}`]
            };
            if (currentCar.upgrade !== "000") {
                carModule.topSpeed = car[`${currentCar.upgrade}TopSpeed`];
                carModule.accel = car[`${currentCar.upgrade}0to60`];
                carModule.handling = car[`${currentCar.upgrade}Handling`];
            }
        
            if (carModule.topSpeed < 60) {
                carModule.accel = 99.9;
            }
        
            if (carModule.topSpeed < 100) {
                carModule.mra = 0;
            }
            if (carModule.topSpeed < 30) {
                carModule.ola = 0;
            }
        
            return carModule;
        }
    }
};