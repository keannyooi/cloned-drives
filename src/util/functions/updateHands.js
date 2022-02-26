"use strict";

function updateHands(playerData, carID, origUpg, newUpgrade) {
    if (playerData.hand?.carID === carID && playerData.hand?.upgrade === origUpg) {
        if (newUpgrade === "remove") {
            playerData.hand = { carID: "", upgrade: "000" };
        }
        else {
            playerData.hand.upgrade = newUpgrade;
        }
    }
    for (let deck of playerData.decks) {
        let index = deck.hand.findIndex(c => c.carID === carID && c.upgrade === origUpg);
        if (index > -1) {
            if (newUpgrade === "remove") {
                deck.hand[index] = "";
                deck.tunes[index] = "000";
            }
            else {
                deck.tunes[index] = newUpgrade;
            }
        }
    }
    return playerData;
}

module.exports = updateHands;