"use strict";

const historicalFlags = {
    "SU": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Flag_of_the_Soviet_Union.svg/80px-Flag_of_the_Soviet_Union.svg.png",
    "YU": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/80px-Flag_of_Yugoslavia_%281946-1992%29.svg.png"
};

function getFlag(code) {
    if (!code || code.length !== 2) {
        return null;
    }
    const upper = code.toUpperCase();
    if (historicalFlags[upper]) {
        return historicalFlags[upper];
    }
    return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

module.exports = getFlag;
