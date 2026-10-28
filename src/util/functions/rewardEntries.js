"use strict";

// The one place that knows how a reward becomes unclaimedRewards entries and
// how those entries are written. Every reward source (events, championships,
// calendars, pack battles, the daily calendar, Hi-Lo, Race Week) builds and
// persists through here, so the contract below changes in one place:
//   - ONE reward key per entry: rewards.js switches on the first key, so a
//     { money, trophies } entry would pay the money and drop the trophies.
//   - rid on non-numeric entries (car/pack/driver/…) for exact removal at
//     claim time (rewardID.js). Numeric ones aggregate per origin instead.
//   - Never $set the whole array: concurrent grants must survive.
// Writers that fold their $push into a bigger atomic update (randomrace's
// outcome write, redeem, daily) keep their own single write rather than
// splitting it through here; they should still build entries with
// toRewardEntries (or stamp a rid) so they follow the contract.
// Light on purpose (rewardID + the profile model only): dailyCalendar used to
// pull the whole pack-battle module in for toRewardEntries.
const makeRewardID = require("./rewardID.js");
const profileModel = require("../../models/profileSchema.js");

/**
 * Reward-entry contract: rewards.js reads ONE reward key per entry (it
 * switches on the first key). A milestone/placement reward written as
 * { money: 500000, trophies: 40 } therefore paid the money and silently
 * dropped the trophies. Split every reward into single-key entries; rid on
 * non-numeric ones for exact removal at claim time.
 */
function toRewardEntries(reward, origin) {
    const entries = [];
    for (const [key, value] of Object.entries(reward || {})) {
        if (value === undefined || value === null) continue;
        const entry = { [key]: value, origin };
        if (key !== "money" && key !== "fuseTokens" && key !== "trophies") entry.rid = makeRewardID();
        entries.push(entry);
    }
    return entries;
}

/**
 * Atomically persist reward entries to unclaimedRewards: money/fuseTokens/
 * trophies aggregate into the matching same-origin entry via the elemMatch
 * positional $inc (falling back to a fresh entry), everything else is $pushed
 * with $each. Never $sets the whole array, so concurrent grants (e.g. Race
 * Week threshold prizes) can't be clobbered.
 * @param {Array<{ key: string, value: number, origin: string }>} aggregates
 * @param {Array<object>} entries  pushed as-is, a rid stamped where missing
 */
async function persistRewards(userID, aggregates, entries) {
    // rid on non-numeric entries -> exact-entry removal at claim (rewardID.js)
    const pushes = entries.map(entry => (entry.rid ? entry : { ...entry, rid: makeRewardID() }));
    // Not one pipeline write: profileCache drops the player's cached garage on
    // any pipeline update. Sequential, not Promise.all: the cache records the
    // stamp of the last post-hook to fire, and concurrent writes can return in
    // a different order than the server applied them, leaving a stale stamp.
    for (const { key, value, origin } of aggregates) {
        const res = await profileModel.updateOne(
            { userID, unclaimedRewards: { "$elemMatch": { origin, [key]: { "$exists": true } } } },
            { "$inc": { [`unclaimedRewards.$.${key}`]: value } }
        );
        const modified = res.modifiedCount !== undefined ? res.modifiedCount : res.nModified;
        if (!modified) pushes.push({ [key]: value, origin });
    }
    if (pushes.length > 0) {
        await profileModel.updateOne(
            { userID },
            { "$push": { unclaimedRewards: { "$each": pushes } } }
        );
    }
}

/**
 * Atomically add money to the player's `origin` unclaimedRewards money entry
 * ($inc on the matched element; $push a fresh { money, origin } when none
 * exists). Never rewrites the whole array, so concurrent background grants
 * survive. No-op for a missing / non-positive amount.
 */
async function persistMoneyReward(userID, amount, origin) {
    if (!amount || amount <= 0) return;
    const res = await profileModel.updateOne(
        { userID, unclaimedRewards: { "$elemMatch": { origin, money: { "$exists": true } } } },
        { "$inc": { "unclaimedRewards.$.money": amount } }
    );
    const modified = res.modifiedCount !== undefined ? res.modifiedCount : res.nModified;
    if (!modified) {
        await profileModel.updateOne(
            { userID },
            { "$push": { unclaimedRewards: { money: amount, origin } } }
        );
    }
}

module.exports = { toRewardEntries, persistRewards, persistMoneyReward };
