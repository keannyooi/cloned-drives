"use strict";

// Short unique ID stamped onto non-numeric unclaimedRewards entries (car/
// pack/driver) at grant time, so the claim flow can remove EXACTLY the entry
// it consumed ($pull by rid) instead of value-matching — value-identical
// entries granted concurrently during a claim window are never collateral.
// Numeric entries (money/fuseTokens/trophies) don't need one: they aggregate
// per-origin and are consumed by atomic decrement.
let counter = 0;
function makeRewardID() {
    counter = (counter + 1) % 1296;
    return Date.now().toString(36)
        + counter.toString(36).padStart(2, "0")
        + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
}

module.exports = makeRewardID;
