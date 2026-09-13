"use strict";

/**
 * CREATOR SUBMISSIONS — cd-sub
 * ============================
 * Everything a creator does with their own work: browse what needs making,
 * check their submissions, fix them, pull them.
 *
 * The review side lives in cd-review. These were one command with eighteen
 * subcommands serving two audiences, so everyone waded through half a menu
 * that was not theirs. Shared rendering stays in
 * util/functions/submissionViews.js so a submission looks identical in both.
 */

const {
    ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const { existsSync } = require("fs");
const path = require("path");
const { ErrorMessage, SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { stagingCrName, archiveLabel, carCrName } = require("../util/functions/submissionDisplay.js");
const submissionModel = require("../models/submissionSchema.js");
const profileModel = require("../models/profileSchema.js");
const { updateSubmission, normalizeSubmissionID, SUBMISSIONS_DIR } = require("../util/functions/submissionStore.js");
const { resolveReference, resolveMake } = require("./submit.js");
const { validateAttachment, archiveSubmissionImage } = require("../util/functions/submissionImage.js");
const { getStagingCars } = require("../util/functions/stagingCars.js");
const listUpdate = require("../util/functions/listUpdate.js");
const {
    isAdmin, fail, searchSubmissions, summarise, buildDetailEmbed, paginate, bySubmissionNumber,
    feed, rawFieldsFrom, mirrorFields, formatDate
} = require("../util/functions/submissionViews.js");
// Car submissions: the stat block is re-validated on every change.
const { canonicalKey } = require("../util/functions/carSubmissionParser.js");
const { validateCarSubmission, describeReport, LABEL, CREATOR_FIELDS, OPTIONAL_FIELDS } = require("../util/functions/carSubmissionValidator.js");
const { collectCarPaste } = require("../util/functions/submitCar.js");
const { snoozeDraft, sendToReview } = require("../util/functions/submissionDrafts.js");
const BT = String.fromCharCode(96);   // backtick, for inline code in messages

module.exports = {
    name: "submissions",
    aliases: ["subs", "sub"],
    usage: [
        "mine [page]", "view <ID>", "missing [search] [page]",
        "search <query> [--all] [--mine]", "collection <name> [--all]",
        "edit <ID>", "image <ID>", "set <ID> <field> <value>",
        "submit <ID [ID …] | all>", "snooze <ID>", "withdraw <ID>", "export <ID>"
    ],
    args: 0,
    category: "Miscellaneous",
    description: "Browse cars needing artwork and manage your own submissions. Reviewing is cd-review.",
    async execute(message, args) {
        const sub = (args[0] || "mine").toLowerCase();
        // Point people at the right command rather than an unknown-subcommand error.
        const REVIEW_ONLY = ["queue", "approve", "reject", "changes", "sethud", "pending", "rebuildmirror", "purgedev", "rescan", "preview"];
        if (REVIEW_ONLY.includes(sub)) {
            return fail(message, "Error, that moved to cd-review.",
                "Use " + "`" + "cd-review " + sub + "`" + " instead — reviewing lives there now.");
        }

        if (sub === "mine") {
            const list = await submissionModel.find({ creatorID: message.author.id }).lean();
            list.sort(bySubmissionNumber);
            if (list.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: "You have not submitted anything yet.",
                    desc: "Submit a whole car with " + BT + "cd-submit car" + BT + ", design a Black Market card with " + BT + "cd-submit bm" + BT + ", or make artwork for a car that needs it — see " + BT + "cd-sub missing" + BT + ".",
                    author: message.author
                }).sendMessage();
            }

            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const perPage = settings.listamount || defaultPageLimit;
            const totalPages = Math.ceil(list.length / perPage);
            const page = parseInt(args[1]) || 1;
            if (page < 1 || totalPages < page) {
                return fail(message, "Error, page number requested invalid.", "Your list ends at page " + totalPages + ".");
            }

            return listUpdate(list, page, totalPages, listDisplay, settings);

            function listDisplay(section, page, totalPages) {
                let rows = "";
                for (let i = 0; i < section.length; i++) {
                    rows += "**" + (i + 1) + ".** " + summarise(section[i]) + "\n";
                }
                if (rows.length > 1024) {
                    return new ErrorMessage({
                        channel: message.channel,
                        title: "This page has too many characters to display.",
                        desc: "Turn on " + BT + "Shortened Lists" + BT + " in " + BT + "cd-settings" + BT + ".",
                        author: message.author
                    });
                }
                // Counts by status, so a long list still tells you what needs doing.
                const tally = {};
                for (const entry of list) tally[entry.status] = (tally[entry.status] || 0) + 1;
                const summary = Object.entries(tally).map(pair => pair[1] + " " + pair[0]).join(" · ");
                return new InfoMessage({
                    channel: message.channel,
                    title: "Your submissions (" + list.length + ")",
                    desc: summary,
                    author: message.author,
                    fields: [{ name: "Submission", value: rows }],
                    footer: "Page " + page + " of " + totalPages + " - Interact with the buttons below to navigate through pages."
                });
            }
        }

        // ── search / collection ──────────────────────────────────────────────

        if (sub === "search" || sub === "collection") {
            const rest = args.slice(1);
            // Flags are stripped out before the query is assembled, so
            // `cd-subs search porsche 911 --all` searches "porsche 911".
            const flags = new Set(rest.filter(part => part.startsWith("--")).map(part => part.toLowerCase()));
            const query = rest.filter(part => !part.startsWith("--")).join(" ").trim();
            if (!query) {
                return fail(message, "Error, nothing to search for.",
                    sub === "search"
                        ? "Example: `cd-sub search porsche 911`\nFlags: `--all` (include closed), `--mine`"
                        : "Example: `cd-sub collection Summer Games 2026`");
            }

            // Pending-only by default — the usual question is "has someone
            // already done this?", which closed submissions don't answer.
            const filter = {};
            if (!flags.has("--all")) filter.status = "pending";
            // Drafts are private: --all shows them only to their owner (--mine) or an admin.
            else if (!flags.has("--mine") && !(await isAdmin(message))) filter.status = { "$ne": "draft" };
            if (flags.has("--mine")) filter.creatorID = message.author.id;

            const all = await submissionModel.find(filter).lean();
            all.sort(bySubmissionNumber);
            // The truthiness check matters: without it a blank query would
            // match every UNCOLLECTED submission ("" === ""). The empty-query
            // guard above already covers the command path, but the filter
            // shouldn't depend on a caller three branches away to be safe.
            const results = sub === "collection"
                ? all.filter(entry => entry.collectionName && entry.collectionName.toLowerCase() === query.toLowerCase())
                : searchSubmissions(all, query);

            if (results.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: `No ${flags.has("--all") ? "" : "pending "}submissions match "${query}".`,
                    desc: flags.has("--all")
                        ? "Nothing at all — the idea looks free."
                        : "Nothing pending. Add `--all` to include approved and rejected ones too.",
                    author: message.author
                }).sendMessage();
            }

            const totalPages = Math.ceil(results.length / PER_PAGE);
            const page = 1;
            return new InfoMessage({
                channel: message.channel,
                title: sub === "collection"
                    ? `${query} — ${results.length} submission(s)`
                    : `${results.length} match(es) for "${query}"`,
                desc: results.slice(0, PER_PAGE).map(summarise).join("\n")
                    + (totalPages > 1 ? `\n\n*…and ${results.length - PER_PAGE} more. Narrow the search to see them.*` : "")
                    + `\n\nOpen one with \`cd-sub view <ID>\`.`,
                author: message.author,
                footer: flags.has("--all") ? undefined : "Pending only — add --all to include closed submissions"
            }).sendMessage();
        }

        // ── cars awaiting artwork ────────────────────────────────────────────
        if (sub === "missing") {
            const { needsArt, unassigned } = getStagingCars();
            // Only a TRAILING 1-2 digit arg is a page number — stripping every
            // number ate years and IDs ("missing 911" searched for nothing and
            // then errored on "page 911").
            const hasPageArg = args.length > 2 && /^\d{1,2}$/.test(args[args.length - 1]);
            const query = args.slice(1, hasPageArg ? args.length - 1 : undefined).join(" ").trim().toLowerCase();
            const list = query
                ? needsArt.filter(car => car.name.toLowerCase().includes(query) || car.key === query)
                : needsArt;

            if (list.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: query ? "Nothing awaiting art matches that." : "Nothing needs artwork right now.",
                    desc: query
                        ? "Run " + BT + "cd-sub missing" + BT + " with no search to see the full list."
                        : "Every staged car already has an image. New ones appear after the next bot restart.",
                    author: message.author
                }).sendMessage();
            }

            // How many submissions each car already has — the signal a creator
            // actually wants when deciding what to spend an evening on.
            const counts = await submissionModel.aggregate([
                { "$match": { type: "art", status: "pending" } },
                { "$group": { _id: "$targetKey", n: { "$sum": 1 } } }
            ]);
            const tally = Object.fromEntries(counts.map(entry => [entry._id, entry.n]));

            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const perPage = settings.listamount || defaultPageLimit;
            const totalPages = Math.ceil(list.length / perPage);
            const page = hasPageArg ? parseInt(args[args.length - 1]) : 1;
            if (page < 1 || totalPages < page) {
                return fail(message, "Error, page number requested invalid.", "The list ends at page " + totalPages + ".");
            }

            return listUpdate(list, page, totalPages, listDisplay, settings);

            function listDisplay(section, page, totalPages) {
                let carList = "";
                for (let i = 0; i < section.length; i++) {
                    const car = section[i];
                    carList += "**" + (i + 1) + ".** ";
                    // BM cards already have art from their submitter — they are
                    // waiting on an admin upload, not on a creator.
                    if (car.kind === "upload") {
                        carList += BT + car.key + BT + " " + car.name + " ⬆️ **UPLOAD IMAGE HERE**\n";
                        continue;
                    }
                    const n = tally[car.key] || 0;
                    carList += BT + car.key + BT + " " + stagingCrName(car);
                    carList += n > 0 ? " · *" + n + " submitted*\n" : "\n";
                }
                if (carList.length > 1024) {
                    return new ErrorMessage({
                        channel: message.channel,
                        title: "This page has too many characters to display.",
                        desc: "Turn on " + BT + "Shortened Lists" + BT + " in " + BT + "cd-settings" + BT + ".",
                        author: message.author
                    });
                }
                return new InfoMessage({
                    channel: message.channel,
                    title: list.length + " car" + (list.length === 1 ? "" : "s") + " awaiting artwork",
                    desc: "Claim one with " + BT + "cd-submit art <carID or name>" + BT + "."
                        + (unassigned > 0 ? "\n\n⚠️ " + unassigned + " staged file(s) have no carID yet." : ""),
                    author: message.author,
                    fields: [{ name: "Car", value: carList }],
                    footer: "Page " + page + " of " + totalPages + " - Interact with the buttons below to navigate through pages."
                });
            }
        }

        // ── send several at once: `submit all` (every draft you own) or
        //    `submit SCR12 SCR13 SCR14` (a list). One ID falls through to the
        //    single path below. Each car is validated and sent on its own, so
        //    one that fails never holds up the others.
        if (sub === "submit" && (args.length > 2 || (args[1] || "").toLowerCase() === "all")) {
            const wantAll = (args[1] || "").toLowerCase() === "all";
            const admin = await isAdmin(message);
            let entries;
            if (wantAll) {
                const drafts = await submissionModel.find({ creatorID: message.author.id, type: "car", status: "draft" });
                if (drafts.length === 0) {
                    return fail(message, "Error, you have no drafts.",
                        "Save one from the preview in `cd-submit car`, or send a single submission with `cd-sub submit <ID>`.");
                }
                drafts.sort(bySubmissionNumber);
                entries = drafts.map(doc => ({ id: doc.submissionID, doc }));
            }
            else {
                const ids = [...new Set(args.slice(1).map(normalizeSubmissionID).filter(Boolean))];
                const docs = await submissionModel.find({ submissionID: { "$in": ids } });
                const byID = new Map(docs.map(doc => [doc.submissionID, doc]));
                entries = ids.map(id => ({ id, doc: byID.get(id) || null }));   // the order they typed
            }

            const lines = [];
            let sent = 0;
            for (const { id, doc } of entries) {
                if (!doc) { lines.push(`❓ \`${id}\` — no such submission`); continue; }
                if (doc.creatorID !== message.author.id && !admin) { lines.push(`🔒 \`${id}\` — not yours`); continue; }
                if (doc.type !== "car") { lines.push(`⏭️ \`${id}\` — not a car submission`); continue; }
                if (!["draft", "changes", "withdrawn"].includes(doc.status)) { lines.push(`⏭️ \`${id}\` — already ${doc.status}`); continue; }
                const result = await sendToReview(doc);
                if (result.ok) {
                    sent++;
                    lines.push(`✅ \`${id}\` ${carCrName(result.submission)}`);
                }
                else {
                    lines.push(`❌ \`${id}\` — ${result.report ? result.report.blockers[0].message : result.reason}`);
                }
            }
            const total = entries.length;
            return new SuccessMessage({
                channel: message.channel,
                title: `Sent ${sent} of ${total} to review.`,
                desc: lines.join("\n").slice(0, 3800)
                    + (sent < total ? "\n\nAnything ❌ needs `cd-sub set <ID> <field> <value>` first, then send it again." : ""),
                author: message.author
            }).sendMessage();
        }

        // ── everything below needs an ID ─────────────────────────────────────
        // "sbm7", "SBM007" and "SBM000007" all resolve to SBM7.
        const submissionID = normalizeSubmissionID(args[1] || "");
        if (!submissionID) {
            return fail(message, "Error, no submission ID given.", "Example: `cd-sub view SBM000001`");
        }
        const submission = await submissionModel.findOne({ submissionID });
        if (!submission) {
            return fail(message, `Error, no submission called \`${submissionID}\`.`, "Check the ID with `cd-sub queue`.");
        }


        const isOwner = submission.creatorID === message.author.id;

        // A suggested edit is one sentence; there is nothing to edit on it.
        if (submission.type === "edit" && ["edit", "set", "image", "submit", "snooze"].includes(sub)) {
            return fail(message, "Error, suggestions can't be edited.",
                `Withdraw it with \`cd-sub withdraw ${submissionID}\` and suggest again from the car's page (\`cd-carinfo\` → Suggest edit).`);
        }

        if (sub === "view") {
            // A draft is the creator's private hold — nobody else's business until it's sent.
            const admin = await isAdmin(message);
            if (submission.status === "draft" && !isOwner && !admin) {
                return fail(message, "Error, that's a private draft.", "It shows up once its creator sends it to review.");
            }
            return message.channel.send({ embeds: [await buildDetailEmbed(submission, { forReviewer: admin })] });
        }

        if (["edit", "withdraw", "set", "image", "submit", "snooze"].includes(sub) && !isOwner && !(await isAdmin(message))) {
            return fail(message, "Error, that is not your submission.", "You can only change your own.");
        }

        /**
         * What separates reject from changes: a rejected submission is CLOSED,
         * a sent-back one is fixable. Without this both statuses would stay
         * editable and the two commands would mean the same thing.
         *
         * "withdrawn" is deliberately still editable — editing sets the status
         * back to pending, which is how a creator un-withdraws.
         */
        const LOCKED_FOR_EDIT = {
            approved: "It is already approved and its carfile is staged — ask an admin to change it by hand.",
            rejected: "That submission was closed. If you think it is fixable, ask an admin to reopen it."
        };
        if (["edit", "image"].includes(sub) && LOCKED_FOR_EDIT[submission.status]) {
            return fail(message, "Error, " + submissionID + " cannot be changed.", LOCKED_FOR_EDIT[submission.status]);
        }
        // A car's stats are what got approved and staged — changing them after
        // the fact would desync the record from the file. (BM `set` stays open:
        // country/year on a BM card are metadata the admin fixes by hand anyway.)
        if (sub === "set" && submission.type === "car" && LOCKED_FOR_EDIT[submission.status]) {
            return fail(message, "Error, " + submissionID + " cannot be changed.", LOCKED_FOR_EDIT[submission.status]);
        }

        // ── car submissions: send / snooze / set ─────────────────────────────

        if (sub === "submit") {
            if (submission.type !== "car") {
                return fail(message, "Error, only car submissions use `submit`.",
                    "Black Market cards and artwork go back to the queue on their own when you edit them.");
            }
            if (!["draft", "changes", "withdrawn"].includes(submission.status)) {
                return fail(message, `Error, ${submissionID} is already ${submission.status}.`, "Only drafts, sent-back and withdrawn submissions can be sent.");
            }
            const result = await sendToReview(submission);
            if (!result.ok) {
                return fail(message, "Error, it doesn't validate any more.",
                    (result.report ? describeReport(result.report).join("\n") : result.reason).slice(0, 3500)
                    + `\n\nFix it with \`cd-sub set ${submissionID} <field> <value>\` and try again.`);
            }
            return new SuccessMessage({
                channel: message.channel,
                title: `Sent ${submissionID} to review.`,
                desc: `**${carCrName(result.submission)}** is in the queue. \`cd-sub view ${submissionID}\` to see it.`,
                author: message.author
            }).sendMessage();
        }

        if (sub === "snooze") {
            if (submission.type !== "car" || submission.status !== "draft") {
                return fail(message, "Error, only drafts can be snoozed.", "A draft is a car saved from the `cd-submit car` preview but not yet sent.");
            }
            const updated = await snoozeDraft(submission);
            return new SuccessMessage({
                channel: message.channel,
                title: `Snoozed ${submissionID}.`,
                desc: `It now goes to review on **${formatDate(updated.draftDeadline)}** unless you send it first`
                    + (updated.snoozeCount > 1 ? ` (snoozed ${updated.snoozeCount} times)` : "") + ".",
                author: message.author
            }).sendMessage();
        }

        if (sub === "set" && submission.type === "car") {
            if (!submission.carData) {
                return fail(message, "Error, that submission has no car data.", "It predates car submissions — ask an admin.");
            }
            const admin = await isAdmin(message);
            const fieldArg = (args[2] || "").toLowerCase();
            const value = args.slice(3).join(" ").trim();
            const settable = [...CREATOR_FIELDS, ...OPTIONAL_FIELDS];
            const fieldList = settable.map(field => LABEL[field]).join(", ");
            if (!fieldArg) {
                return fail(message, "Error, usage is `set <ID> <field> <value>`.",
                    `Fields: ${fieldList}` + (admin ? ", plus `cr` and `hiddentag` for reviewers" : "")
                    + `.\nExample: \`cd-sub set ${submissionID} handling 95\``);
            }

            // Reviewer-only fields live outside the stat block.
            if (fieldArg === "cr" || fieldArg === "hiddentag") {
                if (!admin) return fail(message, "Error, that field is reviewer-only.", "CR comes from the formula; hidden tags are set at review.");
                if (fieldArg === "cr") {
                    if (/^(formula|none|clear|0)?$/.test(value)) {
                        await updateSubmission(submissionID, { crOverride: 0 });
                        return new SuccessMessage({
                            channel: message.channel,
                            title: `${submissionID}: CR override cleared.`,
                            desc: `The formula's **${submission.carData.cr}** stands.`,
                            author: message.author
                        }).sendMessage();
                    }
                    const cr = parseInt(value, 10);
                    if (!Number.isInteger(cr) || cr < 1 || cr > 9999) {
                        return fail(message, "Error, that isn't a usable CR.", "A whole number from 1 to 9999, or `formula` to clear the override.");
                    }
                    await updateSubmission(submissionID, { crOverride: cr });
                    return new SuccessMessage({
                        channel: message.channel,
                        title: `${submissionID}: CR set to ${cr}.`,
                        desc: `Overrides the formula's ${submission.carData.cr}. The view shows both.`,
                        author: message.author
                    }).sendMessage();
                }
                const hidden = value ? value.split(/[,;]/).map(tag => tag.trim()).filter(Boolean) : [];
                await updateSubmission(submissionID, { hiddenTag: hidden });
                return new SuccessMessage({
                    channel: message.channel,
                    title: `${submissionID}: hidden tags ${hidden.length ? "set" : "cleared"}.`,
                    desc: hidden.length ? hidden.join(", ") : "None.",
                    author: message.author
                }).sendMessage();
            }

            const canonical = canonicalKey(fieldArg);
            if (!canonical || !settable.includes(canonical)) {
                return fail(message, `Error, \`${fieldArg}\` isn't a field you can set.`, `Fields: ${fieldList}.`);
            }
            if (!value && !OPTIONAL_FIELDS.includes(canonical)) {
                return fail(message, `Error, give \`${LABEL[canonical]}\` a value.`, `Example: \`cd-sub set ${submissionID} ${LABEL[canonical]} …\``);
            }

            // The whole block is re-validated with the one change applied, so a
            // stat can't be pushed somewhere the paste would have refused.
            const fields = rawFieldsFrom(submission.carData);
            fields[canonical] = value;
            const report = validateCarSubmission(fields, { isAdmin: admin });
            if (!report.ok) {
                return fail(message, "Error, that change doesn't validate.", describeReport(report).join("\n").slice(0, 3800));
            }
            const show = entry => Array.isArray(entry)
                ? (entry.length ? entry.join(", ") : "—")
                : typeof entry === "boolean" ? (entry ? "yes" : "no") : String(entry === "" || entry === undefined ? "—" : entry);
            const before = submission.carData[canonical];
            const crBefore = submission.carData.cr;
            await updateSubmission(submissionID, { carData: report.car, ...mirrorFields(report.car) });
            const notes = describeReport(report).filter(line => line.startsWith("✏️") || line.startsWith("⚠️"));
            return new SuccessMessage({
                channel: message.channel,
                title: `${submissionID}: ${LABEL[canonical]} updated.`,
                desc: `\`${show(before)}\` → **${show(report.car[canonical])}**`
                    + (report.car.cr !== crBefore ? `\nCR ${crBefore} → **${report.car.cr}**` : "")
                    + (notes.length ? `\n\n${notes.join("\n")}` : "")
                    + (["changes", "withdrawn"].includes(submission.status) ? `\n\nSend it back to review with \`cd-sub submit ${submissionID}\` when you're done.` : ""),
                author: message.author
            }).sendMessage();
        }

        if (sub === "set") {
            const field = (args[2] || "").toLowerCase();
            const value = args.slice(3).join(" ").trim();
            if (!["country", "year"].includes(field) || !value) {
                return fail(message, "Error, usage is `set <ID> <country|year> <value>`.",
                    `Examples:\n\`cd-sub set ${submissionID} country GB\`\n\`cd-sub set ${submissionID} year 2011\``);
            }
            if (field === "country") {
                const code = value.toUpperCase();
                if (!/^[A-Z]{2,3}$/.test(code)) {
                    return fail(message, "Error, that isn't a country code.", "Two or three letters, like `DE`, `GB` or `JP`.");
                }
                await updateSubmission(submissionID, { country: code });
                return new SuccessMessage({
                    channel: message.channel,
                    title: `${submissionID} is now ${code}.`,
                    desc: `Country changed from \`${submission.country || "—"}\` to \`${code}\`.`,
                    author: message.author
                }).sendMessage();
            }
            const year = parseInt(value, 10);
            if (!Number.isInteger(year) || year < 1885 || year > 2100) {
                return fail(message, "Error, that isn't a usable year.", "Something between 1885 and 2100.");
            }
            await updateSubmission(submissionID, { modelYear: year });
            return new SuccessMessage({
                channel: message.channel,
                title: `${submissionID} is now a ${year}.`,
                desc: `Model year changed from \`${submission.modelYear || "—"}\` to \`${year}\`.`,
                author: message.author
            }).sendMessage();
        }

        if (sub === "export") {
            if (!isOwner && !(await isAdmin(message))) {
                return fail(message, "Error, that isn't your submission.", "You can only export your own.");
            }
            const file = path.join(SUBMISSIONS_DIR, `${submissionID}.json`);
            if (!existsSync(file)) {
                return fail(message, "Error, no mirror file for that submission.", "An admin can regenerate them all with `cd-sub rebuildmirror`.");
            }
            return message.channel.send({
                content: `\`${submissionID}\` — full record`,
                files: [new AttachmentBuilder(file, { name: `${submissionID}.json` })]
            });
        }

        // Art gets iterated on constantly, and the edit modal can't carry an
        // attachment — so replacing the image is its own command. The previous
        // archive post is left in place as history.

        if (sub === "image") {
            const prompt = await message.channel.send({
                content: `<@${message.author.id}> — post the replacement image for \`${submissionID}\` here now.`
            });
            const collected = await message.channel.awaitMessages({
                filter: msg => msg.author.id === message.author.id && msg.attachments.size > 0,
                max: 1,
                time: 3 * 60 * 1000
            });
            await prompt.delete().catch(() => {});
            const replacement = collected.first();
            if (!replacement) {
                return fail(message, "No image arrived in time.", "Nothing changed — run the command again when you're ready.");
            }
            const attachment = replacement.attachments.first();
            const check = validateAttachment(attachment);
            if (!check.ok) return fail(message, "That image can't be used.", `${check.reason}\n\nNothing changed.`);

            try {
                const archived = await archiveSubmissionImage(
                    attachment, submissionID,
                    archiveLabel(submissionID, submission, getCar(submission.reference))
                );
                const updated = await updateSubmission(submissionID, {
                    imageArchiveChannelID: archived.channelID,
                    imageArchiveMessageID: archived.messageID,
                    imageLocalPath: archived.localPath,
                    imageWidth: archived.width,
                    imageHeight: archived.height
                });
                return message.channel.send({
                    content: `✅ Art replaced on \`${submissionID}\`.`,
                    embeds: [await buildDetailEmbed(updated)]
                });
            }
            catch (error) {
                console.log(`[Submissions] image replace failed for ${submissionID}: ${error.stack}`);
                return fail(message, "Error, the new image couldn't be archived.", `\`${error.message}\`\n\nThe old one is untouched.`);
            }
        }

        if (sub === "withdraw") {
            if (submission.status === "approved") {
                return fail(message, "Error, that one is already approved.", "Approved submissions can't be withdrawn — talk to an admin.");
            }
            if (submission.status === "withdrawn") {
                return fail(message, "Error, that's already withdrawn.", "Nothing to do.");
            }
            await updateSubmission(submissionID, { status: "withdrawn" });
            // Drafts were never in the feed, so pulling one makes no line either.
            if (["pending", "changes"].includes(submission.status)) void feed("withdrawn", submission);
            return new SuccessMessage({
                channel: message.channel,
                title: `Withdrew ${submissionID}.`,
                desc: "It's out of the review queue. The record and its image are kept, so it can be restored if you change your mind.",
                author: message.author
            }).sendMessage();
        }

        // A car is edited by pasting the whole block again — the image stays,
        // and the status stays too: a sent-back car returns to the queue only
        // when the creator says `cd-sub submit`, not on the first half-fix.
        if (sub === "edit" && submission.type === "car") {
            if (!submission.carData) {
                return fail(message, "Error, that submission has no car data.", "It predates car submissions — ask an admin.");
            }
            const admin = await isAdmin(message);
            await message.channel.send({
                content: `<@${message.author.id}> — paste the **full block** for \`${submissionID}\` again, every field. The image stays. Type \`cancel\` to leave it as it is.`
            });
            const collected = await collectCarPaste(message, { deadline: Date.now() + 10 * 60 * 1000, admin, allowBulk: false });
            if (collected.kind !== "single") {
                return fail(message, collected.kind === "cancelled" ? "Edit cancelled." : "Edit timed out.", "Nothing changed.");
            }
            const updated = await updateSubmission(submissionID, { carData: collected.report.car, ...mirrorFields(collected.report.car) });
            return message.channel.send({
                content: `✅ \`${submissionID}\` updated.`
                    + (["changes", "withdrawn"].includes(submission.status) ? ` Send it back to review with \`cd-sub submit ${submissionID}\`.` : ""),
                embeds: [await buildDetailEmbed(updated)]
            });
        }

        if (sub === "edit") {
            const openRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("editOpen").setLabel("Edit this submission").setEmoji("✏️").setStyle(ButtonStyle.Primary)
            );
            const prompt = await message.channel.send({
                content: `Editing \`${submissionID}\` — the form opens pre-filled with what you sent.`,
                components: [openRow]
            });
            const opener = await prompt.awaitMessageComponent({
                filter: interaction => interaction.user.id === message.author.id,
                time: 60000
            }).catch(() => null);
            await prompt.edit({ components: [] }).catch(() => {});
            if (!opener) return;

            const modal = new ModalBuilder()
                .setCustomId(`submitEdit-${submissionID}`)
                .setTitle(`Edit ${submissionID}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("reference").setLabel("Which car is yours based on?")
                        .setValue(submission.reference || submission.referenceName || "")
                        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("model").setLabel("Name of YOUR card")
                        .setValue(submission.model || "")
                        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("make").setLabel("Brand (blank = same as the base car)")
                        .setValue((submission.make || []).join(", "))
                        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("collection").setLabel("Collection (optional)")
                        .setValue(submission.collectionName || "")
                        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("description").setLabel("Description")
                        .setValue(submission.description || "")
                        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
                );

            await opener.showModal(modal);
            const edited = await opener.awaitModalSubmit({
                filter: interaction => interaction.customId === `submitEdit-${submissionID}` && interaction.user.id === message.author.id,
                time: 5 * 60 * 1000
            }).catch(() => null);
            if (!edited) return;

            const rawReference = edited.fields.getTextInputValue("reference");
            const resolved = resolveReference(rawReference);
            const changes = {
                referenceKnown: !!resolved.car,
                reference: resolved.carID,
                referenceName: resolved.car ? "" : rawReference.trim(),
                make: resolveMake(edited.fields.getTextInputValue("make"), resolved.car),
                model: edited.fields.getTextInputValue("model").trim(),
                modelYear: resolved.car ? resolved.car.modelYear : submission.modelYear,
                country: resolved.car ? resolved.car.country : submission.country,
                collectionName: edited.fields.getTextInputValue("collection").trim(),
                description: edited.fields.getTextInputValue("description").trim(),
                // An edit puts a sent-back submission back in the queue.
                status: "pending",
                reviewNote: ""
            };
            const updated = await updateSubmission(submissionID, changes);
            await edited.reply({
                content: `✅ \`${submissionID}\` updated — it's back in the review queue.`,
                embeds: [await buildDetailEmbed(updated)]
            });
            return;
        }

        return fail(message, "Error, unknown subcommand.",
            "Try one of: " + module.exports.usage.join(" · "));
    }
};
