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

/**
 * Removing some copies of a car (sell / exchange / removecar): clears the hand
 * and deck slots for that car+tune only once the garage row has none left at
 * that tune. Call it AFTER decrementing `garageRow.upgrades[upgrade]`, so
 * selling one of three stock copies keeps the hand and decks as they were.
 * Counts every row with that carID, so a legacy garage that still holds a
 * duplicate row doesn't lose its hand while copies remain in the other row.
 */
function removeIfNoneLeft(playerData, garageRow, upgrade) {
    if (!garageRow) return playerData;
    const rows = Array.isArray(playerData.garage) ? playerData.garage.filter(g => g?.carID === garageRow.carID) : [];
    if (!rows.includes(garageRow)) rows.push(garageRow);
    const left = rows.reduce((sum, g) => sum + (g.upgrades?.[upgrade] || 0), 0);
    if (left === 0) {
        updateHands(playerData, garageRow.carID, upgrade, "remove");
    }
    return playerData;
}

module.exports = updateHands;
module.exports.removeIfNoneLeft = removeIfNoneLeft;