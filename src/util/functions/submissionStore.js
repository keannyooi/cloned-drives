"use strict";

/**
 * SUBMISSION STORE
 * ================
 * ID minting and the Mongo → disk mirror.
 *
 * Mongo is the working state (queries, status, search). Every save also writes
 * src/submissions/<ID>.json so any single submission can be recovered by
 * reading a file, and the whole set survives independently of the database.
 * The mirror is best-effort: a disk failure logs and carries on rather than
 * losing a submission that Mongo already accepted.
 */

const bot = require("../../config/config.js");
const { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const submissionModel = require("../../models/submissionSchema.js");
const serverStatModel = require("../../models/serverStatSchema.js");

const SUBMISSIONS_DIR = path.join(__dirname, "../../submissions");
const IMAGES_DIR = path.join(SUBMISSIONS_DIR, "images");

/**
 * SBM = Submit Black Market, SAW = Submit ArtWork.
 *
 * Each type counts separately so the numbers stay small and memorable —
 * SBM1, SAW1 — rather than sharing one counter and producing gappy sequences.
 * IDs are NOT zero-padded: "SBM7" is easier to say, type and search for than
 * "SBM000007", and lookups normalise anyway so both forms resolve.
 */
const ID_PREFIX = {
    bm: "SBM",
    art: "SAW",
    track: "STRK",
    pack: "SPCK"
};

function ensureDirs() {
    mkdirSync(IMAGES_DIR, { recursive: true });   // recursive → makes both
}

/**
 * Mint the next submission ID. Atomic: findOneAndUpdate returns the
 * post-increment value, so two people submitting at the same instant can never
 * land on the same number. Same pattern as the serialised-driver mint ledger.
 *
 * A devMode bot shares the production database, so it mints from a SEPARATE
 * counter and gets a "T" prefix — TSBM000001. Real submission numbers are
 * never consumed by testing, and `cd-review purgedev` can clear the lot.
 */
async function mintSubmissionID(type = "bm") {
    // submissionCounters is a plain object keyed by type, so a new submission
    // type needs no schema change — just a prefix above.
    const scope = bot.devMode ? "dev" : "live";
    const field = `submissionCounters.${scope}_${type}`;
    const stat = await serverStatModel.findOneAndUpdate(
        {},
        { "$inc": { [field]: 1 } },
        { new: true }
    );
    if (!stat) throw new Error("serverStat document not found — cannot mint a submission ID");
    const counters = stat.submissionCounters || {};
    const next = counters[`${scope}_${type}`] || 1;
    const prefix = (bot.devMode ? "T" : "") + (ID_PREFIX[type] || ID_PREFIX.bm);
    return `${prefix}${next}`;
}

/**
 * Accept anything a person might reasonably type for an ID: "sbm7", "SBM007",
 * "SBM000007" all mean SBM7. Returns the canonical form, or the raw input
 * uppercased when it doesn't look like a submission ID at all.
 */
function normalizeSubmissionID(input) {
    const raw = String(input || "").trim().toUpperCase();
    const match = raw.match(/^(T?)(SBM|SAW|STRK|SPCK)0*(\d+)$/);
    return match ? `${match[1]}${match[2]}${match[3]}` : raw;
}

/** Write (or rewrite) the on-disk mirror for one submission. Never throws. */
function mirrorToDisk(submission) {
    try {
        ensureDirs();
        const plain = typeof submission.toObject === "function" ? submission.toObject() : submission;
        delete plain._id;
        delete plain.__v;
        writeFileSync(
            path.join(SUBMISSIONS_DIR, `${plain.submissionID}.json`),
            JSON.stringify(plain, null, 4)
        );
        return true;
    }
    catch (error) {
        console.log(`[Submissions] disk mirror failed for ${submission && submission.submissionID}: ${error.message}`);
        return false;
    }
}

/**
 * Create a submission: mint an ID, write Mongo, mirror to disk.
 * @returns {Promise<Object>} the saved document
 */
async function createSubmission(payload) {
    const now = DateTime.utc().toISO();
    const submissionID = await mintSubmissionID(payload.type || "bm");
    const doc = await submissionModel.create({
        ...payload,
        submissionID,
        isDev: bot.devMode === true,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        submittedAt: now
    });
    mirrorToDisk(doc);
    return doc;
}

/** Patch an existing submission and refresh its mirror. */
async function updateSubmission(submissionID, changes) {
    const doc = await submissionModel.findOneAndUpdate(
        { submissionID },
        { "$set": { ...changes, updatedAt: DateTime.utc().toISO() } },
        { new: true }
    );
    if (doc) mirrorToDisk(doc);
    return doc;
}

/** Read one submission back off disk (recovery path — no database needed). */
function readFromDisk(submissionID) {
    const file = path.join(SUBMISSIONS_DIR, `${submissionID}.json`);
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    }
    catch (error) {
        console.log(`[Submissions] could not read ${submissionID} from disk: ${error.message}`);
        return null;
    }
}

/** Every submission ID currently mirrored on disk. */
function listOnDisk() {
    if (!existsSync(SUBMISSIONS_DIR)) return [];
    return readdirSync(SUBMISSIONS_DIR)
        .filter(file => file.endsWith(".json"))
        .map(file => file.slice(0, -5))
        .sort();
}

/**
 * Rebuild the entire disk mirror from Mongo. Use after a restore, or to
 * back-fill submissions created before mirroring existed.
 * @returns {Promise<{written: number, failed: number}>}
 */
async function rebuildMirror() {
    const all = await submissionModel.find({});
    let written = 0, failed = 0;
    for (const doc of all) {
        if (mirrorToDisk(doc)) written++;
        else failed++;
    }
    return { written, failed };
}

/**
 * Delete every devMode submission and reset the dev counter, so a round of
 * testing leaves the shared database exactly as it found it.
 *
 * Archive-channel posts are NOT deleted — the bot should not be mass-deleting
 * messages, and they're easy to clear by hand. Their IDs are returned so they
 * can be found.
 *
 * @returns {Promise<{removed: number, files: number, archiveMessages: string[]}>}
 */
async function purgeDevSubmissions() {
    const devDocs = await submissionModel.find({ isDev: true }).lean();
    const archiveMessages = devDocs
        .filter(doc => doc.imageArchiveMessageID)
        .map(doc => doc.imageArchiveMessageID);

    let files = 0;
    for (const doc of devDocs) {
        const file = path.join(SUBMISSIONS_DIR, `${doc.submissionID}.json`);
        if (existsSync(file)) {
            try { unlinkSync(file); files++; }
            catch (error) { console.log(`[Submissions] could not delete mirror ${doc.submissionID}: ${error.message}`); }
        }
    }

    const { deletedCount } = await submissionModel.deleteMany({ isDev: true });
    await serverStatModel.updateOne({}, {
        "$set": { "submissionCounters.dev_bm": 0, "submissionCounters.dev_art": 0 }
    });

    return { removed: deletedCount || 0, files, archiveMessages };
}

module.exports = {
    SUBMISSIONS_DIR,
    purgeDevSubmissions,
    IMAGES_DIR,
    ensureDirs,
    mintSubmissionID,
    normalizeSubmissionID,
    mirrorToDisk,
    createSubmission,
    updateSubmission,
    readFromDisk,
    listOnDisk,
    rebuildMirror
};
