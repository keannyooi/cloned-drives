"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));

const action = {
    rq: arg => {
        let { start, end } = arg;
        if (start === end) return `RQ${start} `;
        else return `RQ${start} ~ ${end} `;
    },
    modelYear: arg => {
        let { start, end } = arg;
        if (start % 10 === 0 && end === start + 9) return `${start}s `;
		else if (start === end) return `${start} `;
        else return `${start} ~ ${end} `;
    },
    country: country => `${country.toUpperCase()} `,
    enginePos: enginePos => `${enginePos[0].toUpperCase() + enginePos.slice(1, enginePos.length)}-Engine `,
    driveType: drive => `${drive.toUpperCase()} `,
    gc: gc => `${gc[0].toUpperCase() + gc.slice(1, gc.length)}-GC `,
    seatCount: arg => {
        let { start, end } = arg;
        if (start === end) return `${start}-Seat `;
        else return `${start} ~ ${end}-Seat `;
    },
    fuelType: fuel => `${fuel[0].toUpperCase() + fuel.slice(1, fuel.length)} `,
    bodyStyle: bodyTypes => `${bodyTypes.join(" + ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `,
    tags: tags => `${tags.join(" + ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `,
    isPrize: isPrize => {
        if (isPrize === false) return "Non-Prize ";
        else return "";
    },
    make: makes => {
        makes = makes.map(make => {
            let getExample = carFiles.find(carFile => {
                let currentCar = require(`../../cars/${carFile}`);
                if (Array.isArray(currentCar["make"])) {
                    return currentCar["make"].some(tag => tag.toLowerCase() === make.toLowerCase());
                }
                else {
                    return currentCar["make"].toLowerCase() === make.toLowerCase();
                }
            });
            
            let car = require(`../../cars/${getExample}`);
            if (Array.isArray(car["make"])) {
                return car.find(i => i.toLowerCase() === make.toLowerCase());
            }
            else {
                return car["make"];
            }
        });
        return `${makes.join(" + ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `;
    },
    search: keyword => `${keyword.split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `
}
const order = ["rq", "modelYear", "country", "enginePos", "driveType", "gc", "seatCount", "fuelType", "bodyStyle", "tags", "isPrize", "make", "search"];

function reqDisplay(reqs) {
    let str = "";
    for (let criteria of order) {
        if (reqs[criteria] !== undefined) {
            str += action[criteria](reqs[criteria]);
        }
    }
    if (Object.keys(reqs).length === 0) return "Open Match";
    else return str.slice(0, -1);
}

module.exports = reqDisplay;
