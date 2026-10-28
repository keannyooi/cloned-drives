"use strict";

// Saving for the edit commands (cd-editevent, cd-editchampionship, cd-editoffer,
// cd-editcode, cd-editpackbattle). They load a document, change a field or two,
// then write it back. Passing the whole loaded document to updateOne makes
// mongoose $set EVERY field as it was at load time — so anything players wrote
// in between (a pack battle's playerStats, an event's playerProgress /
// paidPlayers, a code's redeemedBy, an offer's purchasedPlayers) was rolled
// back: lost pack counts, milestones / rounds / codes paid out twice.
//
// Instead: snapshot the document before editing, then $set / $unset only the
// top-level fields the edit actually changed, filtered on the document's _id.

// Fields only players (or the snapshot job) write. An edit never changes
// them, and even if one somehow did, they're never written from here.
const PLAYER_FIELDS = new Set([
    "playerStats", "playerProgress", "paidPlayers", "purchasedPlayers", "redeemedBy", "snapshots"
]);

function plainFields(doc) {
    const obj = doc && typeof doc.toObject === "function"
        ? doc.toObject({ minimize: false, virtuals: false, versionKey: false })
        : { ...doc };
    delete obj._id;
    delete obj.__v;
    for (const field of PLAYER_FIELDS) delete obj[field];
    return obj;
}

// Take this right after loading, before any edit touches the document.
function snapshotEdit(doc) {
    const snapshot = {};
    for (const [key, value] of Object.entries(plainFields(doc))) {
        snapshot[key] = JSON.stringify(value);
    }
    return snapshot;
}

// The update for what changed since the snapshot, or null when nothing did.
function editedUpdate(doc, snapshot) {
    const fields = plainFields(doc);
    const $set = {}, $unset = {};
    for (const [key, value] of Object.entries(fields)) {
        const now = JSON.stringify(value);
        if (now === snapshot[key]) continue;
        if (value === undefined) $unset[key] = "";
        else $set[key] = value;
    }
    for (const key of Object.keys(snapshot)) {
        if (!(key in fields)) $unset[key] = "";
    }
    const update = {};
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;
    return Object.keys(update).length > 0 ? update : null;
}

// Writes only the edited fields. Resolves to the updateOne result, or null
// when the edit changed nothing (no write is sent).
async function saveEdit(model, doc, snapshot) {
    const update = editedUpdate(doc, snapshot);
    if (!update) return null;
    return model.updateOne({ _id: doc._id }, update);
}

module.exports = { snapshotEdit, editedUpdate, saveEdit, PLAYER_FIELDS };
