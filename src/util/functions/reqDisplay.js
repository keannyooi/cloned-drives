"use strict";

const { getCarFiles, getCar } = require("./dataManager.js");
const { normalizeTypeName } = require("./cardType.js");
const order = ["cr", "modelYear", "country", "enginePos", "driveType", "gc", "creator", "tyreType", "seatCount", "fuelType", "bodyStyle", "abs", "tcs", "tags", "collection", "isOwned", "isStock", "isMaxed", "isBM", "isPrize", "cardType", "make", "search"];

function reqDisplay(reqs, filterLogic) {
    const carFiles = getCarFiles();
    // Helper: normalize a value to an array (so we can join multi-value reqs cleanly).
    // Also passes through scalars unchanged for the legacy single-value path.
    const arr = v => Array.isArray(v) ? v : [v];
    const joiner = filterLogic ? " or " : " and ";
    const cap = s => s[0].toUpperCase() + s.slice(1);

    const action = {
        cr: arg => {
            let { start, end } = arg;
            if (start === end) return `CR${start} `;
            else return `CR${start} ~ ${end} `;
        },
        modelYear: arg => {
            let { start, end } = arg;
            if (start % 10 === 0 && end === start + 9) return `${start}s `;
            else if (start === end) return `${start} `;
            else return `${start} ~ ${end} `;
        },
        country: country => `${arr(country).map(c => c.toUpperCase()).join(joiner)} `,
        enginePos: enginePos => `${arr(enginePos).map(e => cap(e)).join(joiner)}-Engine `,
        driveType: drive => `${arr(drive).map(d => d.toUpperCase()).join(joiner)} `,
        gc: gc => `${arr(gc).map(g => cap(g)).join(joiner)}-GC `,
		creator: creator => `${creator} `,
        seatCount: arg => {
            let { start, end } = arg;
            if (start === end) return `${start}-Seat `;
            else return `${start} ~ ${end}-Seat `;
        },
        fuelType: fuel => `${arr(fuel).map(f => cap(f)).join(joiner)} `,
        bodyStyle: bodyTypes => `${arr(bodyTypes).join(joiner).split(" ").map(i => cap(i)).join(" ")} `,
        tyreType: tyreType => `${arr(tyreType).map(t => t.split("-").map(p => cap(p)).join("-")).join(joiner)}-Tyre `,
        abs: abs => abs ? "ABS-inclusive " : "ABS-less ",
        tcs: tcs => tcs ? "TCS-inclusive " : "TCS-less ",
        tags: tags => `${tags.join(filterLogic ? " or " : " and ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `,
        collection: collection => `${collection.join(filterLogic ? " or " : " and ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `,
        isPrize: isPrize => `${isPrize === false ? "Non-Prize" : "Prize"} `,
        isStock: isStock => `${isStock === false ? "Non-Stock" : "Stock"} `,
        isMaxed: isMaxed => `${isMaxed === false ? "Non-Maxed" : "Maxed"} `,
        isOwned: isOwned => `${isOwned === false ? "Unowned" : "Owned"} `,
        isBM: isBM => `${isBM === false ? "Non-BM" : "BM"} `,
        cardType: types => `${arr(types).map(t => normalizeTypeName(String(t)) || String(t)).join("/")} `,
        make: makes => {
            makes = makes.map(make => {
                let getExample = carFiles.find(carFile => {
                    let currentCar = getCar(carFile);
                    if (Array.isArray(currentCar["make"])) {
                        return currentCar["make"].some(tag => tag.toLowerCase() === make.toLowerCase());
                    }
                    else {
                        return currentCar["make"].toLowerCase() === make.toLowerCase();
                    }
                });
                
                let car = getCar(getExample);
                if (Array.isArray(car["make"])) {
                    return car["make"].find(i => i.toLowerCase() === make.toLowerCase());
                }
                else {
                    return car["make"];
                }
            });
            return `${makes.join(filterLogic ? " or " : " and ").split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `;
        },
        search: keyword => `${keyword.split(" ").map(i => i[0].toUpperCase() + i.slice(1, i.length)).join(" ")} `
    }
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
