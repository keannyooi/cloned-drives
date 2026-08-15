"use strict";

const { Schema, model } = require("mongoose");

/**
 * CREATOR SUBMISSIONS
 * ===================
 * One document per proposed card. `submissionID` ("SBM000001") is minted once
 * and never changes — it stays the handle for the submission even after it is
 * approved and shipped as a real car.
 *
 * Every save is also mirrored to src/submissions/<ID>.json by
 * util/functions/submissionStore.js, so a submission can be recovered from
 * disk without touching the database.
 *
 * NOTE: the grouping field is `collectionName`, not `collection` — Mongoose
 * reserves `collection` as a schema pathname and throws on it. It is written
 * out as `collection` in the generated carfile, which is what the game reads.
 */
const submissionSchema = new Schema({
    submissionID: { type: String, unique: true, index: true },
    // "bm" for now; the ID prefix varies by type so cars/tracks/packs can slot
    // in later off the same counter.
    type: { type: String, default: "bm" },
    // pending → approved | rejected | changes | withdrawn
    status: { type: String, default: "pending", index: true },

    // True when created by a devMode bot. Dev and production share one
    // database, so this is what keeps test data identifiable and purgeable.
    isDev: { type: Boolean, default: false, index: true },

    creatorID: { type: String, index: true },
    creatorTag: { type: String, default: "" },
    createdAt: { type: String, default: "" },
    updatedAt: { type: String, default: "" },
    submittedAt: { type: String, default: "" },

    // Free-text grouping ("Summer Games 2026"). Empty = standalone submission.
    collectionName: { type: String, default: "", index: true },

    // ─── Art submissions (type: "art") ───────────────────────────────────────
    // Artwork proposed for a car that already exists as a staged carfile but
    // has no `racehud` yet. Keyed on make|model|year rather than carID: every
    // staged file carries the placeholder "c0" until the rename scripts run.
    // Several creators may target the same car — that's the point, it gives
    // the admin a choice — so these are never deduped.
    targetKey: { type: String, default: "", index: true },
    targetName: { type: String, default: "" },
    targetFile: { type: String, default: "" },

    // ─── BM payload ──────────────────────────────────────────────────────────
    // BM cards carry no stats of their own — they inherit everything from the
    // `reference` car, which must already exist in the game.
    referenceKnown: { type: Boolean, default: true },
    reference: { type: String, default: "" },
    // Only set when the base car ISN'T in the game yet — it has to be added
    // before this submission can ever be approved.
    referenceName: { type: String, default: "" },
    make: { type: Array, default: [] },
    model: { type: String, default: "" },
    modelYear: { type: Number, default: 0 },
    country: { type: String, default: "" },
    description: { type: String, default: "" },
    // Chosen at approval time: IBM (vaulted) | ABM (in rotation) | PBM (prize-only).
    cardType: { type: String, default: "IBM" },
    // Final art URL, set by `sethud` after the image is uploaded to file.garden.
    // Stored HERE rather than only patched into the staged file, so the record
    // is complete even when the bot runs on a remote host.
    racehud: { type: String, default: "" },

    // ─── Image ───────────────────────────────────────────────────────────────
    // Discord attachment URLs are signed and expire (~24h), so the URL is NEVER
    // stored — only the archive message, re-fetched for a fresh URL on demand.
    imageArchiveChannelID: { type: String, default: "" },
    imageArchiveMessageID: { type: String, default: "" },
    imageLocalPath: { type: String, default: "" },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },

    // ─── Review (phase 2) ────────────────────────────────────────────────────
    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: String, default: "" },
    reviewNote: { type: String, default: "" },
    generatedFile: { type: String, default: "" },
    finalCarID: { type: String, default: "" }
}, { minimize: false });

const submissionModel = model("Submission", submissionSchema, "submissions");
module.exports = submissionModel;
