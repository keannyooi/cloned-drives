"use strict";

const profileModel = require("../../models/profileSchema.js");

/**
 * Consume claimed NUMERIC rewards (money / fuseTokens / trophies) from a
 * player's unclaimedRewards — decrement exactly what was granted, then sweep
 * spent (<= 0) husks per key.
 *
 * VALUE-AWARE MATCH (2026-09-03 fix): only an entry that still HOLDS the
 * granted amount may be decremented. Several sources push multiple numeric
 * entries under ONE origin (every pack-battle milestone shares
 * "<battle> Milestone"); the old "field exists" match kept hitting the FIRST
 * such entry — driving it negative (then swept) while its siblings survived
 * untouched and paid out AGAIN on the next claim. Matching on `>= amount`
 * means each decrement lands on an entry that actually funded the grant, so
 * the pool is conserved in every ordering. Concurrent merge-style grants
 * ($inc on an existing entry) stay claimable exactly as before.
 *
 * @param {string} userID
 * @param {Array<{key: string, amount: number, origin: string}>} consumedNumeric
 */
async function consumeNumericRewards(userID, consumedNumeric) {
    for (const num of consumedNumeric) {
        const filterFor = cond => ({
            userID,
            unclaimedRewards: { "$elemMatch": { origin: num.origin, [num.key]: cond } }
        });
        const decrement = { "$inc": { [`unclaimedRewards.$.${num.key}`]: -num.amount } };

        let result = await profileModel.updateOne(filterFor({ "$gte": num.amount }), decrement);
        if (result.matchedCount === 0) {
            // Should not happen (the grant was read from an entry holding this
            // amount, and the per-user lock rules out a concurrent claim) —
            // fall back to any positive entry, then the legacy shape, and say so.
            result = await profileModel.updateOne(filterFor({ "$gt": 0 }), decrement);
            if (result.matchedCount === 0) {
                result = await profileModel.updateOne(filterFor({ "$exists": true }), decrement);
            }
            console.log(`[rewards] numeric consumption fallback for ${userID}: ${num.origin} / ${num.key} ${num.amount} (matched=${result.matchedCount})`);
        }
    }
    for (const huskKey of [...new Set(consumedNumeric.map(num => num.key))]) {
        await profileModel.updateOne(
            { userID },
            { "$pull": { unclaimedRewards: { [huskKey]: { "$lte": 0 } } } }
        );
    }
}

module.exports = consumeNumericRewards;
