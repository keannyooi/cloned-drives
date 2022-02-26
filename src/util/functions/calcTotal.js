"use strict";

function calcTotal(car) {
    if (typeof car !== "object") return 0;
    return Object.values(car.upgrades).reduce((total, amount) => total + amount);
}

module.exports = calcTotal;