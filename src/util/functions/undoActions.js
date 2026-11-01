"use strict";

/**
 * UNDO ACTIONS — the logic behind cd-undo (no Discord objects in or out).
 *
 * cd-sell, cd-upgrade and cd-changetune record what they did, and the player
 * who ran them can reverse it within 2 hours. Three rules hold everything up:
 *
 *   - exact reversal: copies come back at the recorded tunes and the recorded
 *     money moves back, or nothing happens. A short balance is refused, so a
 *     balance never goes negative and there are no partial restores;
 *   - one undo only: the row is claimed atomically BEFORE the garage write;
 *   - no free upgrades: race() calls markRaced, and an upgrade that has been
 *     raced with can't be refunded.
 */

const undoActionModel = require("../../models/undoActionSchema.js");
const { getProfile } = require("./profileCache.js");
const { saveGarage, snapshotHandDecks, handDeckChanges } = require("./garageWrite.js");
const addCars = require("./addCars.js");
const updateHands = require("./updateHands.js");

const UNDO_WINDOW_MS = 2 * 60 * 60 * 1000;
const LIST_LIMIT = 10;
// While an undo is under way its row is kept this long instead of until the
// 2 hours are up. If the undo dies half way, staff still have the car list.
const CLAIM_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
// How many cars of a sale the preview reads; a big sale's full list is 300 KB.
const PREVIEW_CARS = 8;
const UNDO_HINT = "Changed your mind? `cd-undo` within 2 hours.";
const UPGRADE_UNDO_HINT = "Changed your mind? `cd-undo` within 2 hours, as long as you don't race this car first (test races count).";
const UNDO_RECORD_FAILED = "This sale can't be undone, because something went wrong saving the undo. Tell staff if you need it reversed.";

// ─── Recording ──────────────────────────────────────────────────────────────
// A failed record must never fail the action it describes: these log and
// resolve false, and the caller leaves the undo hint off its success message.

async function record(fields, now) {
    const createdAt = new Date(now);
    try {
        await undoActionModel.create({ ...fields, createdAt, expiresAt: new Date(createdAt.getTime() + UNDO_WINDOW_MS) });
        return true;
    }
    catch (error) {
        console.error(`[undo] could not record ${fields.kind} by ${fields.actorID}:`, error);
        return false;
    }
}

/** @param cars [{ carID, tune, n }] what was ACTUALLY sold  @param slots from clearedSlots() */
async function recordSell({ actorID, summary, cars, money, slots = {}, now = Date.now() }) {
    const sold = cars.filter(car => car.n > 0).sort((a, b) => b.n - a.n);
    return record({
        actorID,
        targetID: actorID,
        kind: "sell",
        summary,
        cars: sold,
        carCount: sold.reduce((sum, car) => sum + car.n, 0),
        modelCount: new Set(sold.map(car => car.carID)).size,
        money,
        hand: slots.hand ?? null,
        decks: slots.decks ?? []
    }, now);
}

async function recordUpgrade({ actorID, summary, carID, from, to, money, now = Date.now() }) {
    return record({ actorID, targetID: actorID, kind: "upgrade", summary, carID, from, to, money }, now);
}

async function recordChangeTune({ actorID, targetID, targetName, summary, carID, from, to, now = Date.now() }) {
    return record({ actorID, targetID, targetName, kind: "changetune", summary, carID, from, to }, now);
}

/**
 * The hand and deck slots a sale emptied: compares a snapshotHandDecks taken
 * before the sale with the profile after it. Decks are named, so a restore
 * finds the right one even if others were deleted since.
 */
function clearedSlots(snapshot, profile) {
    const hand = snapshot.hand ? JSON.parse(snapshot.hand) : null;
    const decks = snapshot.decks ? JSON.parse(snapshot.decks) : [];
    const slots = { hand: null, decks: [] };
    if (hand?.carID && !profile.hand?.carID) slots.hand = { carID: hand.carID, upgrade: hand.upgrade };
    decks.forEach((deck, d) => {
        (deck?.hand || []).forEach((slot, index) => {
            if (slot && !profile.decks?.[d]?.hand?.[index]) {
                slots.decks.push({ deck: deck.name, index, carID: slot.carID, upgrade: slot.upgrade });
            }
        });
    });
    return slots;
}

// ─── Reading ────────────────────────────────────────────────────────────────

/**
 * Actions this player can still undo, newest first. A sale carries only its
 * largest few cars. A raced upgrade never can be, so it is left out here: it
 * must not take up a place on the list and push a live sale off the end.
 */
async function listOpen(actorID, { limit = LIST_LIMIT, skip = 0, now = Date.now() } = {}) {
    return undoActionModel
        .find({
            actorID, undoneAt: null, expiresAt: { $gt: new Date(now) },
            $or: [{ kind: { $ne: "upgrade" } }, { racedAt: null }]
        }, { cars: { $slice: PREVIEW_CARS } })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
}

/** How many actions listOpen can reach (live), and how many upgrades it leaves out as raced. */
async function openCounts(actorID, now = Date.now()) {
    const rows = await undoActionModel
        .find({ actorID, undoneAt: null, expiresAt: { $gt: new Date(now) } }, { kind: 1, racedAt: 1 })
        .lean();
    const raced = rows.filter(row => row.kind === "upgrade" && row.racedAt).length;
    return { live: rows.length - raced, raced };
}

function formatTimeLeft(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

// ─── The checks, shared by the preview and the write ────────────────────────

const copiesAt = (profile, carID, tune) => (profile.garage || [])
    .filter(row => row?.carID === carID)
    .reduce((sum, row) => sum + (row.upgrades?.[tune] || 0), 0);

/**
 * Why this action can't be undone right now, or null if it can.
 * @returns {null|{ code: string, short?: number, need?: number, have?: number, tune?: string }}
 */
function checkAction(action, profile, now = Date.now()) {
    if (action.undoneAt) return { code: "already" };
    if (new Date(action.expiresAt).getTime() <= now) return { code: "expired" };
    if (action.kind === "upgrade" && action.racedAt) return { code: "raced" };
    if (!profile) return { code: "no_profile" };
    if (action.kind === "sell") {
        const have = profile.money || 0;
        if (have < action.money) {
            return { code: "short", need: action.money, have, short: action.money - have, left: new Date(action.expiresAt).getTime() - now };
        }
    }
    else if (copiesAt(profile, action.carID, action.to) < 1) {
        return { code: "no_copy", tune: action.to };
    }
    return null;
}

/** A refusal from checkAction or undoAction, in words a player can read. */
function describeRefusal(refusal, moneyEmoji = "") {
    const money = amount => `${moneyEmoji}${amount.toLocaleString("en")}`;
    switch (refusal.code) {
        case "short":
            return `You don't have the sale money any more. This takes back ${money(refusal.need)} and you have ${money(refusal.have)}, so you are ${money(refusal.short)} short.${refusal.left > 0 ? ` If you get it back within ${formatTimeLeft(refusal.left)}, you can run this again.` : ""}`;
        case "raced":
            return "You have raced this car since the upgrade, so it can't be undone. Test races count too.";
        case "no_copy":
            return `There is no copy of this car at \`${refusal.tune}\` to change back.`;
        case "expired":
            return "The 2 hours to undo this have passed.";
        case "already":
            return "This has already been undone.";
        case "no_profile":
            return "That player no longer has a profile.";
        case "changed":
            return "The garage changed at the same moment. Please run the command again.";
        case "failed":
            return "Something went wrong, but nothing was changed. Please try again in a moment.";
        case "unknown":
            return "Something went wrong and I can't tell if the undo went through, so it has been closed. Check your garage and balance, and tell staff if anything looks wrong.";
        default:
            return "I can't find that action.";
    }
}

/** The title over a refusal: a short balance can still be fixed, the rest can't. */
function refusalTitle(refusal) {
    return refusal.code === "short" ? "You can't undo this yet." : "Error, this can't be undone.";
}

// ─── Building the write ─────────────────────────────────────────────────────

/** Put back slots the sale emptied, only where the slot is still empty. */
function restoreSlots(profile, action) {
    if (action.hand?.carID && !profile.hand?.carID) {
        profile.hand = { carID: action.hand.carID, upgrade: action.hand.upgrade };
    }
    for (const slot of action.decks || []) {
        const deck = (profile.decks || []).find(d => d?.name === slot.deck);
        if (!deck || !Array.isArray(deck.hand) || slot.index >= deck.hand.length) continue;
        if (!deck.hand[slot.index]) deck.hand[slot.index] = { carID: slot.carID, upgrade: slot.upgrade };
    }
}

/**
 * Move one copy back to its old tune. A hand or deck slot follows only once no
 * copy is left at the new tune: it would otherwise point at a car the player
 * doesn't own, whoever put it there. While a copy remains, the slot is valid
 * and may be the player's own choice since, so it stays as it is.
 */
function moveTuneBack(profile, action) {
    const row = profile.garage.find(r => r?.carID === action.carID && (r.upgrades?.[action.to] || 0) >= 1);
    row.upgrades[action.to]--;
    row.upgrades[action.from] = (row.upgrades[action.from] || 0) + 1;
    if (copiesAt(profile, action.carID, action.to) === 0) {
        updateHands(profile, action.carID, action.to, action.from);
    }
}

/** Applies the undo to `profile` in memory and returns the saveGarage arguments. */
function buildUndoWrite(action, profile) {
    const before = structuredClone(profile.garage);
    const handDecks = snapshotHandDecks(profile);
    const inc = {}, filter = {};
    if (action.kind === "sell") {
        // addCars is the one place new rows are shaped, so a row dropped when
        // the last copy sold comes back with every tune key.
        addCars(profile.garage, action.cars.flatMap(car => Array(car.n).fill({ carID: car.carID, upgrade: car.tune })));
        restoreSlots(profile, action);
        if (action.money > 0) {
            inc.money = -action.money;
            filter.money = { $gte: action.money };
        }
    }
    else {
        moveTuneBack(profile, action);
        if (action.kind === "upgrade" && action.money > 0) inc.money = action.money;
    }
    return {
        userID: action.targetID,
        before,
        after: profile.garage,
        inc,
        filter,
        ...handDeckChanges(profile, handDecks),
        returning: ["money"],
        baseStamp: profile.cacheStamp
    };
}

// ─── The undo ───────────────────────────────────────────────────────────────

/**
 * Reverse one action. Only actorID can, and only once.
 * @returns {Promise<{ ok: true, action: Object, balance: number|undefined }
 *   | { ok: false, code: string, short?: number, need?: number, have?: number, tune?: string }>}
 */
async function undoAction({ actionID, actorID, now = Date.now() }) {
    const claimedAt = new Date(now);
    // The row as it was before the claim, so `expiresAt` is the real deadline.
    const action = await undoActionModel.findOneAndUpdate(
        {
            _id: actionID,
            actorID,
            undoneAt: null,
            expiresAt: { $gt: claimedAt },
            // A race that landed since the preview loses the refund.
            $or: [{ kind: { $ne: "upgrade" } }, { racedAt: null }]
        },
        { $set: { undoneAt: claimedAt, expiresAt: new Date(now + CLAIM_KEEP_MS) } },
        { returnDocument: "before", lean: true }
    );
    if (!action) {
        const row = await undoActionModel.findOne({ _id: actionID, actorID }, { cars: 0 }).lean();
        if (!row) return { ok: false, code: "gone" };
        // Done, expired or raced, or else another undo was mid-way at that moment.
        const refusal = checkAction(row, null, now);
        return { ok: false, ...(refusal && refusal.code !== "no_profile" ? refusal : { code: "changed" }) };
    }

    const release = () => undoActionModel.updateOne({ _id: action._id, undoneAt: claimedAt }, { $set: { undoneAt: null, expiresAt: action.expiresAt } })
        .catch(error => console.error(`[undo] could not release action ${action._id}:`, error));

    // A refused write need not mean anything relevant changed: over 1,000
    // cars saveGarage's whole write is guarded by cacheStamp, which ANY
    // profile write bumps. So rebuild once from a fresh read before giving up.
    for (let attempt = 1; attempt <= 2; attempt++) {
        let write;
        try {
            const profile = await getProfile(action.targetID);
            const refusal = checkAction(action, profile, now);
            if (refusal) {
                await release();
                return { ok: false, ...refusal };
            }
            write = buildUndoWrite(action, profile);
        }
        catch (error) {
            // Nothing has been sent to the garage yet, so the player can try again.
            console.error(`[undo] could not prepare action ${action._id} by ${actorID}:`, error);
            await release();
            return { ok: false, code: "failed" };
        }

        let saved;
        try {
            saved = await saveGarage(write);
        }
        catch (error) {
            // saveGarage only throws when it can't tell whether the write landed.
            // Releasing here could let a second undo apply it twice, so stay closed.
            console.error(`[undo] outcome unknown for ${action.kind} action ${action._id} by ${actorID} on ${action.targetID}; left closed, row kept for staff:`, error);
            return { ok: false, code: "unknown" };
        }
        if (saved.ok) {
            await undoActionModel.updateOne({ _id: action._id }, { $set: { expiresAt: action.expiresAt } })
                .catch(error => console.error(`[undo] could not reset expiry of action ${action._id}:`, error));
            return { ok: true, action, balance: saved.doc?.money };
        }
        // Rebuilding or releasing after a write that may have landed could apply it twice.
        if (saved.uncertain) {
            console.error(`[undo] outcome uncertain for ${action.kind} action ${action._id} by ${actorID} on ${action.targetID}; left closed, row kept for staff`);
            return { ok: false, code: "unknown" };
        }
    }
    await release();
    return { ok: false, code: "changed" };
}

/**
 * Called from race() for every race, not awaited. Marks the player's open
 * upgrades on the car that raced: a refund after racing it is the exploit this
 * closes. With no carID it marks all of them, so a car object that doesn't say
 * which car it is can never leave a refund open.
 * A row an undo has claimed is marked too: that undo may yet be refused and
 * reopen the row, and it must not come back refundable. Never throws or rejects.
 */
function markRaced(userID, carID, now = Date.now()) {
    const at = new Date(now);
    return Promise.resolve()
        .then(() => undoActionModel.updateMany(
            { actorID: userID, kind: "upgrade", ...(carID ? { carID } : {}), racedAt: null, expiresAt: { $gt: at } },
            { $set: { racedAt: at } }
        ))
        .then(() => true)
        .catch(error => {
            console.error(`[undo] could not mark upgrades raced for ${userID}:`, error);
            return false;
        });
}

module.exports = {
    UNDO_WINDOW_MS, LIST_LIMIT, PREVIEW_CARS, CLAIM_KEEP_MS, UNDO_HINT, UPGRADE_UNDO_HINT, UNDO_RECORD_FAILED,
    recordSell, recordUpgrade, recordChangeTune, clearedSlots,
    listOpen, openCounts, formatTimeLeft,
    checkAction, describeRefusal, refusalTitle, restoreSlots, moveTuneBack, buildUndoWrite,
    undoAction, markRaced
};
