"use strict";

function getFlag(code) {
    if (code.length !== 2) {
        return null;
    }
    switch (code) {
        case "YU":
            return "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/1000px-Flag_of_Yugoslavia_%281946-1992%29.svg.png";
        default:
            return `https://getflags.net/img1000/${code.toLowerCase()}.png`;
    }
}

module.exports = getFlag;