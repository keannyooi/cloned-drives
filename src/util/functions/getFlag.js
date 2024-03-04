"use strict";

function getFlag(code) {
    if (code.length !== 2) {
        return null;
    }
            return `https://cd2.linkh.at/${code.toLowerCase()}`;
    }

module.exports = getFlag;