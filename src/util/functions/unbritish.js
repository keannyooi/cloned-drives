"use strict";

function unbritish(value, type) {
    switch (type) {
        case "0to60":
        case "accel":
            return (value * 1.036).toFixed(1);
        case "weight":
            return Math.round(value * 2.20462262185).toLocaleString("en");
        case "topSpeed":
            return Math.round(value * 1.60934).toLocaleString("en");
        default:
            return;
    }
}

module.exports = unbritish;