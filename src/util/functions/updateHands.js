"use strict";

/**
 * Keeps the player's hand AND saved decks in sync when a car's upgrade level
 * changes (sell / fuse / change-tune / removecar / etc.).
 *
 * Deck shape: `decks: [{ name, hand: [{carID, upgrade}, ...], ... }]`
 * Slots in `hand` may be null (empty slot during deck construction) — those are skipped.
 *
 * - newUpgrade === "remove"  → the car at that tune was destroyed, clear the slot
 * - otherwise                 → the player still owns this car but at a new tune level
 */
function updateHands(playerData, carID, origUpg, newUpgrade) {
    // Update the active hand
    if (playerData.hand?.carID === carID && playerData.hand?.upgrade === origUpg) {
        if (newUpgrade === "remove") {
            playerData.hand = { carID: "", upgrade: "000" };
        }
        else {
            playerData.hand.upgrade = newUpgrade;
        }
    }

    // Update every saved deck
    if (Array.isArray(playerData.decks)) {
        for (const deck of playerData.decks) {
            if (!deck || !Array.isArray(deck.hand)) continue;
            for (let i = 0; i < deck.hand.length; i++) {
                const slot = deck.hand[i];
                if (!slot || slot.carID !== carID || slot.upgrade !== origUpg) continue;
                if (newUpgrade === "remove") {
                    deck.hand[i] = null; // empty slot — deck is now incomplete
                }
                else {
                    deck.hand[i] = { carID, upgrade: newUpgrade };
                }
            }
        }
    }

    return playerData;
}

module.exports = updateHands;