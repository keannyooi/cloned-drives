"use strict";

/**
 * CAR SUBMISSION DRAFTS
 * =====================
 * A draft is a valid car the creator is holding back — usually until they
 * have artwork — with a clock on it: a reminder at consts.draftReminderDays
 * and an automatic send to review at consts.draftAutoSubmitDays. The clock
 * runs from creation (or the last snooze); editing and attaching art do not
 * reset it, so a draft is always "a 30-day hold" and nothing subtler.
 *
 * Everything that moves a car INTO the review queue goes through
 * sendToReview() — the creator's `cd-sub submit`, `submit all`, the sweep in
 * index.js — so the re-validation, the status write and the feed line happen
 * in exactly one place.
 */

const { DateTime } = require("luxon");
const { draftReminderDays, draftAutoSubmitDays } = require("../consts/consts.js");
const { updateSubmission } = require("./submissionStore.js");
const { validateCarSubmission } = require("./carSubmissionValidator.js");
const { feed, rawFieldsFrom, mirrorFields } = require("./submissionViews.js");

/** ISO moment a draft created/snoozed now would be sent automatically. */
function newDeadline(now = DateTime.utc()) {
    return now.plus({ days: draftAutoSubmitDays }).toISO();
}

/** Restart the clock. Manual only — nothing in the bot calls this on its own. */
async function snoozeDraft(submission) {
    return updateSubmission(submission.submissionID, {
        draftDeadline: newDeadline(),
        reminderSentFor: "",
        snoozeCount: (submission.snoozeCount || 0) + 1
    });
}

/**
 * Send a car to review: re-validate against today's roster (a tag may have
 * been retired since it was saved), flip to pending, post the feed line.
 * Validated as admin — any reserved tag on it was put there by someone
 * allowed to, and re-checking is about roster drift, not policy.
 *
 * @returns {Promise<{ok: true, submission: Object} | {ok: false, report?: Object, reason?: string}>}
 */
async function sendToReview(submission, { auto = false } = {}) {
    if (!submission.carData) return { ok: false, reason: "this submission has no car data" };
    const report = validateCarSubmission(rawFieldsFrom(submission.carData), { isAdmin: true });
    if (!report.ok) return { ok: false, report };

    const wasChanges = submission.status === "changes";
    const updated = await updateSubmission(submission.submissionID, {
        status: "pending",
        submittedAt: DateTime.utc().toISO(),
        draftDeadline: "",
        reminderSentFor: "",
        reviewNote: "",
        autoSubmitted: auto,
        carData: report.car,
        ...mirrorFields(report.car)
    });
    void feed(auto ? "auto" : wasChanges ? "resubmitted" : "submitted", updated);
    return { ok: true, submission: updated };
}

module.exports = { newDeadline, snoozeDraft, sendToReview, draftReminderDays, draftAutoSubmitDays };
