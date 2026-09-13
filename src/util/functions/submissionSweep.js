"use strict";

/**
 * SUBMISSION SWEEP — the draft clock, and the "in the game" check
 * ================================================================
 * A draft is a private hold with a promise printed on it: "goes to review
 * automatically on <date>". This is what keeps the promise.
 *
 *   sweepDrafts()     at startup and once a day (index.js cron):
 *                     - the reminder DM at consts.draftReminderDays
 *                     - past the deadline → sendToReview({ auto: true }): the
 *                       car goes to the queue as it stands, with the ⏰ marker
 *                       and a feed line, and the creator is told
 *                     - can't be sent because roster drift made a blocker →
 *                       DM what to fix, once a day, and try again tomorrow
 *   checkLiveCars()   at startup only, because that's when cars load: an
 *                     approved car submission whose make / model / year now
 *                     loads as a live car gets its carID recorded, one feed
 *                     line and one DM — the moment a creator otherwise never
 *                     hears about.
 *
 * Both scope by isDev, so the dev bot only ever touches dev records even
 * though it shares the database. Every step is idempotent (reminderSentFor,
 * blockedNotifiedOn, the status flip, liveCarID), so a restart mid-sweep or
 * two sweeps in one day change nothing.
 *
 * classifyDraft() is pure so the timing rules are testable without a database.
 */

const { DateTime } = require("luxon");
const bot = require("../../config/config.js");
const submissionModel = require("../../models/submissionSchema.js");
const { updateSubmission } = require("./submissionStore.js");
const { notifyCreator, feed, formatDate } = require("./submissionViews.js");
const { sendToReview, newDeadline, draftReminderDays, draftAutoSubmitDays } = require("./submissionDrafts.js");
const { describeReport } = require("./carSubmissionValidator.js");
const { carCrName } = require("./submissionDisplay.js");
const { normalizeKey } = require("./carSubmissionParser.js");
const { getCarFiles, getCar } = require("./dataManager.js");
const { isBMCar } = require("./cardType.js");

/**
 * What the clock says about one draft.
 *   "reset"  — no usable deadline (legacy or malformed record): give it a fresh one
 *   "send"   — the deadline has passed
 *   "remind" — the reminder is due and hasn't gone out for THIS deadline
 *   "wait"   — nothing to do today
 *
 * The reminder sits (autoSubmitDays − reminderDays) before the deadline, so it
 * is "day 14 of 30" whether the clock started at creation or at a snooze —
 * and a snooze, which clears reminderSentFor, re-arms it.
 */
function classifyDraft(draft, now = DateTime.utc()) {
    const deadline = DateTime.fromISO(draft.draftDeadline || "");
    if (!deadline.isValid) return "reset";
    if (now >= deadline) return "send";
    const reminderAt = deadline.minus({ days: draftAutoSubmitDays - draftReminderDays });
    if (now >= reminderAt && draft.reminderSentFor !== draft.draftDeadline) return "remind";
    return "wait";
}

async function sweepDrafts(now = DateTime.utc()) {
    const drafts = await submissionModel.find({ type: "car", status: "draft", isDev: bot.devMode === true });
    const tally = { drafts: drafts.length, reminded: 0, sent: 0, blocked: 0, reset: 0 };

    for (const draft of drafts) {
        const id = draft.submissionID;
        try {
            switch (classifyDraft(draft, now)) {
                case "reset":
                    await updateSubmission(id, { draftDeadline: newDeadline(now), reminderSentFor: "" });
                    tally.reset++;
                    break;

                case "remind":
                    await notifyCreator(draft, "📝 Your draft is waiting",
                        `**${carCrName(draft)}** has been a draft for ${draftReminderDays} days.\n\n`
                        + `\`cd-sub image ${id}\` — attach the artwork\n`
                        + `\`cd-sub submit ${id}\` — send it to review\n`
                        + `\`cd-sub snooze ${id}\` — hold it for another ${draftAutoSubmitDays} days\n\n`
                        + `Left alone, it goes to review as it is on **${formatDate(draft.draftDeadline)}**.`);
                    await updateSubmission(id, { reminderSentFor: draft.draftDeadline });
                    tally.reminded++;
                    break;

                case "send": {
                    const result = await sendToReview(draft, { auto: true });
                    if (result.ok) {
                        tally.sent++;
                        await notifyCreator(result.submission, "⏰ Your draft went to review",
                            `**${carCrName(result.submission)}** reached the end of its ${draftAutoSubmitDays}-day hold and has been sent to review as it stands.`
                            + (result.submission.imageArchiveMessageID
                                ? ""
                                : "\n\nIt has no artwork, so once it's approved and staged it will be open for anyone to draw — see `cd-sub missing`.")
                            + `\n\n\`cd-sub view ${id}\` to see it.`);
                        break;
                    }
                    // Overdue but no longer valid (a tag retired, a value the
                    // roster no longer knows). Nag once a day, not once a sweep.
                    tally.blocked++;
                    const today = now.toISODate();
                    if (draft.blockedNotifiedOn !== today) {
                        const why = result.report
                            ? describeReport(result.report).filter(line => line.startsWith("❌")).join("\n")
                            : result.reason;
                        await notifyCreator(draft, "⚠️ Your draft can't be sent yet",
                            `**${carCrName(draft)}** was due to go to review, but it no longer passes the checks:\n\n${why}\n\n`
                            + `Fix it with \`cd-sub set ${id} <field> <value>\` — it goes to review automatically once it validates, `
                            + `or send it yourself with \`cd-sub submit ${id}\`.`);
                        await updateSubmission(id, { blockedNotifiedOn: today });
                    }
                    break;
                }

                default:
                    break;
            }
        }
        catch (error) {
            console.log(`[Submissions] draft sweep failed on ${id}: ${error.message}`);
        }
    }

    if (tally.drafts > 0) {
        console.log(`[Submissions] draft sweep: ${tally.drafts} draft(s) — ${tally.reminded} reminded, ${tally.sent} sent to review, ${tally.blocked} blocked, ${tally.reset} reset`);
    }
    return tally;
}

/** Lead brand + model + year, punctuation- and case-insensitive. */
const liveKey = (make, model, year) => {
    const lead = Array.isArray(make) ? make[0] || "" : make || "";
    return `${normalizeKey(lead)}|${normalizeKey(model || "")}|${year}`;
};

async function checkLiveCars() {
    const approved = await submissionModel.find({ type: "car", status: "approved", liveCarID: "", isDev: bot.devMode === true });
    const tally = { approved: approved.length, live: 0 };
    if (approved.length === 0) return tally;

    // Index the live roster once; BM cards are skipped because they borrow a
    // reference car's name and would false-match it.
    const index = new Map();
    for (const file of getCarFiles()) {
        const carID = file.replace(/\.json$/, "");
        const car = getCar(carID);
        if (!car || isBMCar(car)) continue;
        const key = liveKey(car.make, car.model, car.modelYear);
        if (!index.has(key)) index.set(key, carID);
    }

    for (const submission of approved) {
        const carID = index.get(liveKey(submission.make, submission.model, submission.modelYear));
        if (!carID) continue;
        try {
            const updated = await updateSubmission(submission.submissionID, { liveCarID: carID, finalCarID: carID });
            tally.live++;
            void feed("live", updated, { carID });
            await notifyCreator(updated, "🚗 Your car is in the game!",
                `**${carCrName(updated)}** is live as \`${carID}\`. Go and find it 🖤`);
        }
        catch (error) {
            console.log(`[Submissions] live check failed on ${submission.submissionID}: ${error.message}`);
        }
    }
    if (tally.live > 0) console.log(`[Submissions] live check: ${tally.live} approved car(s) now in the game`);
    return tally;
}

/** Daily and at startup: close suggested edits nobody has reviewed for 30 days. */
async function sweepSuggestions() {
    try {
        return await require("./suggestEdit.js").closeStaleSuggestions();
    }
    catch (error) {
        console.log(`[Submissions] stale-suggestion sweep failed: ${error.message}`);
        return { checked: 0, closed: 0 };
    }
}

/** Startup: all three checks. The daily cron runs sweepDrafts and sweepSuggestions — cars only load at startup. */
async function runSubmissionSweep() {
    const drafts = await sweepDrafts();
    const live = await checkLiveCars();
    const suggestions = await sweepSuggestions();
    return { drafts, live, suggestions };
}

module.exports = { classifyDraft, sweepDrafts, checkLiveCars, sweepSuggestions, runSubmissionSweep, liveKey };
