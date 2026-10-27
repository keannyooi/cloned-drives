"use strict";

const profileModel = require("../../models/profileSchema.js");
const { consumeNumericStages, PIPELINE_OPTIONS } = require("./rewardPipelines.js");
const { writeWithHeavy } = require("./profileCache.js");

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
 * Runs as ONE pipeline write (rewardPipelines.consumeNumericStages, same
 * match and fallback order: holds >= amount, then > 0, then key present).
 * cd-rewards folds these stages into its single final write instead.
 *
 * @param {string} userID
 * @param {Array<{key: string, amount: number, origin: string}>} consumedNumeric
 */
async function consumeNumericRewards(userID, consumedNumeric) {
    if (consumedNumeric.length === 0) return;
    await writeWithHeavy(userID, {}, () =>
        profileModel.updateOne({ userID }, consumeNumericStages(consumedNumeric), PIPELINE_OPTIONS)
    );
}

module.exports = consumeNumericRewards;
