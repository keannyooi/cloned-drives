"use strict";

/**
 * SUBMISSION REVIEW — cd-review
 * =============================
 * The admin half of the pipeline: the queue, the decisions, the housekeeping.
 * Creators use cd-sub; nothing here is available to them.
 *
 * Rendering is shared with cd-sub via util/functions/submissionViews.js, so a
 * submission looks the same whoever is looking at it.
 */

const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { getArchivedImageURL } = require("../util/functions/submissionImage.js");

/**
 * The submitted artwork as a Discord attachment, so an approval hands you the
 * file to upload to file.garden without hunting for it. Local archive copy
 * first (no network), the archive channel otherwise. Null if neither works.
 */
async function artworkAttachment(submission) {
    if (submission.imageLocalPath) {
        const full = path.join(__dirname, "../..", submission.imageLocalPath);
        if (fs.existsSync(full)) return new AttachmentBuilder(full, { name: path.basename(full) });
    }
    const url = await getArchivedImageURL(submission);
    if (!url) return null;
    const response = await fetch(url).catch(() => null);
    if (!response || !response.ok) return null;
    const ext = (url.split("?")[0].match(/\.(png|jpe?g|webp|gif)$/i) || [null, "png"])[1];
    return new AttachmentBuilder(Buffer.from(await response.arrayBuffer()), { name: `${submission.submissionID}.${ext}` });
}
const { submissionArchiveChannelID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { crName, carCrName } = require("../util/functions/submissionDisplay.js");
const submissionModel = require("../models/submissionSchema.js");
const { updateSubmission, rebuildMirror, purgeDevSubmissions, normalizeSubmissionID } = require("../util/functions/submissionStore.js");
const { generateCarfile, generateNormalCarfile, formatCarfile } = require("../util/functions/submissionCarfile.js");
const { getStagingCar, refreshStaging } = require("../util/functions/stagingCars.js");
const { previewEmbed, previewButtons, loadCandidateImages } = require("../util/functions/submissionPreview.js");
const {
    isAdmin, fail, summarise, submissionName, notifyCreator, feed, buildDetailEmbed, paginate, bySubmissionNumber,
    archiveMessageLink, rawFieldsFrom, mirrorFields
} = require("../util/functions/submissionViews.js");
const { validateCarSubmission, describeReport } = require("../util/functions/carSubmissionValidator.js");
const { runSubmissionSweep } = require("../util/functions/submissionSweep.js");
const { formatDate } = require("../util/functions/submissionViews.js");
const { DateTime } = require("luxon");

/**
 * Queue order: everyone's first car before anyone's second. Oldest-first
 * within a creator, creators in the order their oldest entry arrived — so a
 * ten-car batch from one person can't wall off someone else's single card.
 * `list` must already be in submission-number order.
 */
function interleaveByCreator(list) {
    const lanes = new Map();
    for (const entry of list) {
        const key = entry.creatorID || "?";
        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push(entry);
    }
    const out = [];
    for (let round = 0; out.length < list.length; round++) {
        for (const lane of lanes.values()) if (lane[round]) out.push(lane[round]);
    }
    return out;
}
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const BT = String.fromCharCode(96);   // backtick, for inline code in messages

module.exports = {
    name: "review",
    aliases: ["rev", "reviewsubs"],
    usage: [
        "queue [bm/art/car/edit] [page]", "view <ID>", "preview <carID | ID>",
        "approve <ID> [IBM|ABM|PBM | Normal|Prize | apply] [collection]", "reject <ID> <reason>", "changes <ID> <note>",
        "sethud <ID> <url>", "pending", "rescan", "rebuildmirror", "purgedev",
        "sweep", "clock <ID> <days>"
    ],
    args: 0,
    category: "Admin",
    description: "Review creator submissions: approve, reject, request changes, attach final art.",
    async execute(message, args) {
        if (!(await isAdmin(message))) {
            return fail(message, "Error, this command is admin-only.", "Creators use cd-sub.");
        }
        const sub = (args[0] || "queue").toLowerCase();

        if (sub === "queue") {
            // Optional type filter so BM cards and artwork don't clash in one
            // list: queue bm / queue art / queue saw / queue sbm — with or
            // without a page number after it.
            const TYPE_WORDS = { bm: "bm", sbm: "bm", art: "art", saw: "art", artwork: "art", car: "car", cars: "car", scr: "car", edit: "edit", edits: "edit", sed: "edit", suggestion: "edit", suggestions: "edit" };
            let typeFilter = null, pageArg = args[1];
            if (args[1] && TYPE_WORDS[String(args[1]).toLowerCase()]) {
                typeFilter = TYPE_WORDS[String(args[1]).toLowerCase()];
                pageArg = args[2];
            }
            const filter = { status: "pending" };
            if (typeFilter) filter.type = typeFilter;

            const all = await submissionModel.find(filter).lean();
            if (all.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: typeFilter
                        ? `No pending ${typeFilter === "bm" ? "BM card" : typeFilter === "car" ? "car" : typeFilter === "edit" ? "suggested edit" : "artwork"} submissions.`
                        : "The review queue is empty.",
                    desc: typeFilter ? "The other queue might not be — `cd-review queue` shows everything." : "Nothing is waiting on you.",
                    author: message.author
                }).sendMessage();
            }
            // Numeric ID order = true submission order (a DB string sort puts
            // SAW10 before SAW2), then interleaved by creator so a batch from
            // one person never walls off everyone else. listUpdate gives the
            // same page buttons every other list in the bot has.
            all.sort(bySubmissionNumber);
            const ordered = interleaveByCreator(all);
            const creators = new Set(all.map(entry => entry.creatorID)).size;
            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const { page, totalPages } = paginate(ordered, pageArg);
            return listUpdate(ordered, page, totalPages, queueDisplay, settings);

            function queueDisplay(section, page, totalPages) {
                const label = typeFilter === "bm" ? " BM cards" : typeFilter === "art" ? " artwork submissions" : typeFilter === "car" ? " cars" : typeFilter === "edit" ? " suggested edits" : "";
                return new InfoMessage({
                    channel: message.channel,
                    title: "Review queue — " + all.length + " pending" + label,
                    desc: section.map(summarise).join("\n")
                        + (creators > 1 ? "\n\n*Everyone's first before anyone's second.*" : "")
                        + (typeFilter ? "" : "\n*Split the queue: `cd-review queue bm` · `queue art` · `queue car` · `queue edit`*"),
                    author: message.author,
                    footer: "Page " + page + " of " + totalPages + " - Interact with the buttons below to navigate through pages."
                });
            }
        }

        if (sub === "pending") {
            // Car submissions are left out on purpose: once staged and given a
            // carID, an art-less car is tracked by `cd-sub missing` (the staging
            // scan), and its art arrives through the artwork flow — not sethud.
            const waiting = await submissionModel.find({ status: "approved", finalCarID: "", type: { "$ne": "car" } }).lean();
            waiting.sort(bySubmissionNumber);
            return new InfoMessage({
                channel: message.channel,
                title: waiting.length === 0 ? "Nothing is waiting on art." : `${waiting.length} approved, still needing art`,
                desc: waiting.length === 0
                    ? "Every approved BM card has its final URL attached. Art-less cars live in `cd-sub missing` once staged."
                    : waiting.map(summarise).join("\n") + "\n\nAttach one with `cd-review sethud <ID> <url>`.",
                author: message.author
            }).sendMessage();
        }

        // The staging scan is cached from startup — normally right, since a
        // restart is what publishes a new batch. This re-reads without one,
        // which matters when iterating.
        if (sub === "rescan") {
            const { needsArt, scanned, unreadable } = refreshStaging();
            return new SuccessMessage({
                channel: message.channel,
                title: "Staging folder rescanned.",
                desc: `**${scanned}** carfile(s) read · **${needsArt.length}** awaiting artwork`
                    + (unreadable > 0 ? ` · ${unreadable} unreadable` : "")
                    + (needsArt.length > 0 ? `\n\n${needsArt.slice(0, 10).map(car => `• ${car.name}`).join("\n")}` : ""),
                author: message.author
            }).sendMessage();
        }

        if (sub === "rebuildmirror") {
            const { written, failed } = await rebuildMirror();
            return new SuccessMessage({
                channel: message.channel,
                title: "Mirror rebuilt.",
                desc: `Wrote **${written}** submission file(s) to \`src/submissions/\`${failed ? `, **${failed}** failed (see console)` : "."}`,
                author: message.author
            }).sendMessage();
        }

        if (sub === "purgedev") {
            const { removed, files, archiveMessages } = await purgeDevSubmissions();
            return new SuccessMessage({
                channel: message.channel,
                title: removed === 0 ? "No test submissions to purge." : `Purged ${removed} test submission(s).`,
                desc: removed === 0
                    ? "Nothing in the database is marked as devMode."
                    : `Removed **${removed}** record(s) and **${files}** mirror file(s), and reset the dev counter.\n\n`
                        + (archiveMessages.length > 0
                            ? `⚠️ **${archiveMessages.length} archive post(s) were left in place** — delete them by hand in <#${require("../util/consts/consts.js").submissionArchiveChannelID}>.`
                            : ""),
                author: message.author
            }).sendMessage();
        }

        // Run the draft clock and the "in the game" check now rather than
        // waiting for midday — for testing, or after a batch of cars ships.
        if (sub === "sweep") {
            const { drafts, live, suggestions } = await runSubmissionSweep();
            return new SuccessMessage({
                channel: message.channel,
                title: "Sweep done.",
                desc: `**Drafts:** ${drafts.drafts} checked — ${drafts.reminded} reminded, ${drafts.sent} sent to review, `
                    + `${drafts.blocked} overdue but blocked, ${drafts.reset} given a fresh clock.\n`
                    + `**Live check:** ${live.approved} approved car(s) looked up, ${live.live} now in the game.\n`
                    + `**Suggestions:** ${suggestions.checked} open, ${suggestions.closed} closed as stale.`,
                author: message.author
            }).sendMessage();
        }

        // ── preview: the card, with each candidate artwork on it ─────────────
        if (sub === "preview") {
            const target = normalizeSubmissionID(args[1] || "");
            if (!target) {
                return fail(message, "Error, preview what?",
                    "Give a carID or a submission ID — " + BT + "cd-review preview c08612" + BT + " or " + BT + "cd-review preview SAW3" + BT + ".");
            }

            // Accept either the car itself or any submission pointing at it,
            // because you will have whichever is in front of you.
            let staged = getStagingCar(target.toLowerCase());
            if (!staged) {
                const viaSubmission = await submissionModel.findOne({ submissionID: target });
                if (viaSubmission && viaSubmission.type === "art") staged = getStagingCar(viaSubmission.targetKey);
                if (!staged) {
                    return fail(message, "Error, nothing to preview for " + target + ".",
                        "Preview works on staged cars still awaiting artwork. See " + BT + "cd-sub missing" + BT + ".");
                }
            }

            const candidates = await submissionModel
                .find({ type: "art", targetKey: staged.key, status: { "$in": ["pending", "approved"] } });
            candidates.sort(bySubmissionNumber);
            const images = await loadCandidateImages(candidates);

            let index = 0;
            const render = () => ({
                embeds: [previewEmbed(staged, candidates[index] || null, index, candidates.length, images[index])],
                components: [previewButtons(candidates.length, candidates.length > 0)]
            });
            const board = await message.channel.send(render());

            const collector = board.createMessageComponentCollector({
                filter: click => click.user.id === message.author.id,
                time: 5 * 60 * 1000
            });

            collector.on("collect", async click => {
                if (click.customId === "pickArt") {
                    collector.stop("picked");
                    await click.deferUpdate().catch(() => {});
                    return;
                }
                // Wrap around — with four candidates you want to loop, not stop.
                index = click.customId === "nextArt"
                    ? (index + 1) % candidates.length
                    : (index - 1 + candidates.length) % candidates.length;
                await click.update(render()).catch(() => {});
            });

            collector.on("end", async (_collected, reason) => {
                await board.edit({ components: [] }).catch(() => {});
                if (reason !== "picked") return;
                const chosen = candidates[index];
                if (!chosen) return;
                await message.channel.send({
                    content: "Approve **" + chosen.submissionID + "** for " + staged.name + "?\n"
                        + "Run " + BT + "cd-review approve " + chosen.submissionID + BT + " — that closes the other submissions and tells their creators."
                }).catch(() => {});
            });
            return;
        }

        // ── everything below needs an ID ─────────────────────────────────────
        // "sbm7", "SBM007" and "SBM000007" all resolve to SBM7.
        const submissionID = normalizeSubmissionID(args[1] || "");
        if (!submissionID) {
            return fail(message, "Error, no submission ID given.", "Example: `cd-review view SBM000001`");
        }
        const submission = await submissionModel.findOne({ submissionID });
        if (!submission) {
            return fail(message, `Error, no submission called \`${submissionID}\`.`, "Check the ID with `cd-review queue`.");
        }


        if (sub === "view") {
            return message.channel.send({ embeds: [await buildDetailEmbed(submission, { forReviewer: true })] });
        }

        // Move a draft's clock: `clock TSCR2 0` makes it due now, `clock TSCR2 15`
        // puts it 15 days out (so the 14-day reminder is already due). Re-arms
        // the reminder. For testing the sweep without waiting a fortnight.
        if (sub === "clock") {
            if (submission.type !== "car" || submission.status !== "draft") {
                return fail(message, "Error, only drafts have a clock.", "The clock decides when a draft is reminded about and sent automatically.");
            }
            const days = parseInt(args[2], 10);
            if (!Number.isInteger(days) || days < -365 || days > 365) {
                return fail(message, "Error, give a number of days.", `\`cd-review clock ${submissionID} 0\` — due now · \`cd-review clock ${submissionID} 15\` — 15 days out`);
            }
            const deadline = DateTime.utc().plus({ days }).toISO();
            await updateSubmission(submissionID, { draftDeadline: deadline, reminderSentFor: "", blockedNotifiedOn: "" });
            return new SuccessMessage({
                channel: message.channel,
                title: `${submissionID} is now due ${days <= 0 ? "now" : `on ${formatDate(deadline)}`}.`,
                desc: "Reminder re-armed. Run `cd-review sweep` to apply the clock immediately.",
                author: message.author
            }).sendMessage();
        }

        if (sub === "approve") {
            if (submission.status === "approved") {
                return fail(message, "Error, that's already approved.", `Its file is \`${submission.generatedFile || "unknown"}\`.`);
            }

            // ── suggested edits: write the value in (power) or accept the ticket ──
            if (submission.type === "edit") {
                const { applySuggestion, notifyEveryone } = require("../util/functions/suggestEdit.js");
                const wantApply = (args[2] || "").toLowerCase() === "apply";
                let outcome;
                try { outcome = await applySuggestion(submission, { by: message.author.id, apply: wantApply }); }
                catch (error) {
                    return fail(message, "Error, the carfile couldn't be patched.", `\`${error.message}\`\n\nNothing was changed; the suggestion is still pending.`);
                }
                const approved = await updateSubmission(submissionID, {
                    status: "approved",
                    reviewedBy: message.author.id,
                    reviewedAt: new Date().toISOString(),
                    ...(outcome.applied ? { appliedAt: new Date().toISOString(), appliedBy: message.author.id, appliedValue: String(outcome.to).slice(0, 200) } : {})
                });
                const target = `**${submission.targetName || submission.reference}**`;
                const shown = value => (value === null || value === undefined || value === "" ? "—" : String(value).slice(0, 200));
                const reached = await notifyEveryone(
                    { ...approved.toObject(), status: "approved" },
                    "✅ Your suggestion was accepted",
                    `The **${submission.field}** of ${target} ${outcome.applied ? `is now **${submission.proposedValue}**` : "will be changed as you suggested"}. Thanks for the correction 🖤`
                );
                void feed("approved", approved, {
                    detail: outcome.applied ? `applied: ${shown(outcome.from).slice(0, 60)} → ${shown(outcome.to).slice(0, 60)}` : "accepted, applied by hand"
                });
                if (outcome.applied) {
                    await message.channel.send({
                        content: `\`${submissionID}\` — patched \`${submission.reference}.json\` and reloaded the car. If the bot runs on another machine, drop this over your copy before committing.`,
                        files: [new AttachmentBuilder(Buffer.from(outcome.text, "utf8"), { name: `${submission.reference}.json` })]
                    }).catch(() => {});
                }
                return new SuccessMessage({
                    channel: message.channel,
                    title: `Approved ${submissionID}.`,
                    desc: (outcome.applied
                        ? `**${submission.field}** of ${target}: ${shown(outcome.from)} → **${shown(outcome.to)}**. The carfile is patched and the car reloaded — commit \`src/cars/${submission.reference}.json\` on your normal cadence.`
                        : `Marked accepted — ${outcome.why || "apply it by hand"}.\n\n**Proposed:** ${String(submission.proposedValue).slice(0, 1500)}`)
                        + (reached === "nobody" ? "\n\n⚠️ The suggester couldn't be notified." : ""),
                    author: message.author
                }).sendMessage();
            }

            // Art: nothing to generate — the carfile already exists and only
            // needs its racehud filled in by hand. Picking one closes the
            // others so nobody is left waiting on a decision already made.
            if (submission.type === "art") {
                await updateSubmission(submissionID, {
                    status: "approved",
                    reviewedBy: message.author.id,
                    reviewedAt: new Date().toISOString()
                });

                const rivals = await submissionModel.find({
                    type: "art",
                    targetKey: submission.targetKey,
                    status: "pending",
                    submissionID: { "$ne": submissionID }
                });
                for (const rival of rivals) {
                    await updateSubmission(rival.submissionID, {
                        status: "rejected",
                        reviewedBy: message.author.id,
                        reviewedAt: new Date().toISOString(),
                        reviewNote: `Another submission was chosen for ${submission.targetName}.`
                    });
                    await notifyCreator(
                        { ...rival.toObject(), status: "rejected" },
                        "🎨 Another artwork was picked",
                        `Thanks for your work on **${submission.targetName}** — someone else's was chosen this time.\n\n`
                            + "Nothing wrong with yours; see `cd-sub missing` for what still needs art."
                    );
                }

                await notifyCreator(
                    { ...submission.toObject(), status: "approved" },
                    "🎨 Your artwork was picked!",
                    `**${submission.targetName}** is going into the game with your card. Nice one 🖤`
                );
                void feed("picked", submission, { detail: rivals.length > 0 ? `${rivals.length} other${rivals.length === 1 ? "" : "s"} closed` : "" });

                const artwork = await artworkAttachment(submission);
                if (artwork) {
                    await message.channel.send({
                        content: `\`${submissionID}\` — artwork for **${submission.targetName}**, ready to upload to file.garden`,
                        files: [artwork]
                    }).catch(() => {});
                }

                return new SuccessMessage({
                    channel: message.channel,
                    title: `Picked ${submissionID} for ${submission.targetName}.`,
                    desc: `${rivals.length > 0 ? `Closed **${rivals.length}** other submission(s) for the same car.\n\n` : ""}`
                        + "**Next:** download the artwork above, upload it to file.garden, then paste the URL into\n"
                        + `\`${submission.targetFile}\`\n\n`
                        + "It drops off `cd-sub missing` after the next restart.",
                    author: message.author
                }).sendMessage();
            }
            // ── whole cars: Normal | Prize, full carfile to the staging root ──
            if (submission.type === "car") {
                if (!submission.carData) {
                    return fail(message, "Error, that submission has no car data.", "It predates car submissions and can't be approved from here.");
                }
                // Re-check against today's roster — a tag may have been retired
                // since it was sent. What's stored is what ships.
                const report = validateCarSubmission(rawFieldsFrom(submission.carData), { isAdmin: true });
                if (!report.ok) {
                    return fail(message, "Error, it no longer validates.",
                        describeReport(report).join("\n").slice(0, 3500) + `\n\nFix it with \`cd-sub set ${submissionID} <field> <value>\`.`);
                }

                const CAR_TYPES = { NORMAL: "Normal", PRIZE: "Prize" };
                let cardType = CAR_TYPES[(args[2] || "").toUpperCase()] || "";
                let collectionArg = cardType ? args.slice(3).join(" ") : args.length > 2 ? args.slice(2).join(" ") : "";
                collectionArg = collectionArg.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
                if (!cardType) {
                    const pickRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("carTypeNormal").setLabel("Normal").setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId("carTypePrize").setLabel("Prize").setStyle(ButtonStyle.Secondary)
                    );
                    const ask = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle(`Approving ${submissionID} — which type?`)
                            .setDescription("**Normal** — drops from packs and the dealership like any other car\n"
                                + "**Prize** — a locked reward card: events, Race Week, never from packs")],
                        components: [pickRow]
                    });
                    const picked = await ask.awaitMessageComponent({
                        filter: click => click.user.id === message.author.id,
                        time: 60000
                    }).catch(() => null);
                    await ask.edit({ components: [] }).catch(() => {});
                    if (!picked) return;
                    await picked.deferUpdate().catch(() => {});
                    cardType = picked.customId === "carTypePrize" ? "Prize" : "Normal";
                }
                const collectionName = collectionArg || submission.collectionName || "";

                // Art that arrived with the submission is hosted off its archive
                // message link, so the car is complete the moment it's approved
                // and is never offered to other artists. No art = "" = it shows
                // in cd-sub missing once it has a carID.
                const racehud = submission.racehud || archiveMessageLink(submission);
                const approved = await updateSubmission(submissionID, {
                    status: "approved",
                    cardType,
                    collectionName,
                    racehud,
                    // Same convention sethud uses for BM cards: "staged" marks
                    // "nothing more to attach", so `pending` stays clean.
                    finalCarID: racehud ? "staged" : "",
                    reviewedBy: message.author.id,
                    reviewedAt: new Date().toISOString(),
                    carData: report.car,
                    ...mirrorFields(report.car)
                });
                let generated;
                try {
                    generated = generateNormalCarfile(approved.toObject());
                }
                catch (error) {
                    return fail(message, "Error, the carfile couldn't be written.", `\`${error.message}\``);
                }
                await updateSubmission(submissionID, { generatedFile: generated.path });

                const reached = await notifyCreator(
                    { ...approved.toObject(), status: "approved" },
                    "✅ Your car was approved!",
                    `**${carCrName(approved)}** is going into the game as a **${cardType}** card.`
                        + (racehud ? "" : "\n\nIt has no artwork yet — once it's staged with a carID, anyone (you included) can draw it via `cd-submit art`.")
                        + "\n\nThanks for building it 🖤"
                );
                void feed("approved", approved, {
                    detail: `${cardType}${collectionName ? ` · ${collectionName}` : ""}${racehud ? "" : " · needs artwork"}`
                });

                const files = [new AttachmentBuilder(Buffer.from(formatCarfile(generated.json), "utf8"), { name: generated.filename })];
                const artwork = await artworkAttachment(approved);
                if (artwork) files.push(artwork);
                await message.channel.send({
                    content: `\`${submissionID}\` — **${cardType}** carfile${artwork ? " + the artwork" : ""}, ready to drop into \`src/0 Carfiles to Add/\``,
                    files
                }).catch(() => {});

                const crLine = approved.crOverride > 0
                    ? `CR **${approved.crOverride}** (reviewer override; formula said ${report.car.cr})`
                    : `CR **${report.car.cr}** (formula)`;
                return new SuccessMessage({
                    channel: message.channel,
                    title: `Approved ${submissionID} as ${cardType}.`,
                    desc: `Staged at \`${generated.path}\` (and attached above). ${crLine}. Collection: **${collectionName || "none"}**.\n\n`
                        + (racehud
                            ? "🖼️ Art is hosted off the archive link, so the car is complete. To move it to file.garden later: "
                                + `\`cd-review sethud ${submissionID} <url>\`.`
                            : "**Next:** drop the file into staging, run the carID script, push, then `cd-review rescan` — "
                                + "it appears in `cd-sub missing` for artwork from there.")
                        + (reached === "nobody" ? "\n\n⚠️ The creator couldn't be notified." : ""),
                    author: message.author
                }).sendMessage();
            }

            if (!submission.reference) {
                return fail(message, "Error, this can't be approved yet.",
                    `It's based on "${submission.referenceName}", which isn't in the game. Add that car first, then edit the submission's reference.`);
            }
            // The reference was valid when submitted, but carIDs get reassigned
            // by the rename scripts and cars get removed — approving a stale
            // one would stage a carfile pointing at nothing.
            if (!getCar(submission.reference)) {
                return fail(message, "Error, the reference car no longer exists.",
                    `\`${submission.reference}\` isn't in the catalogue any more — it was probably renumbered or removed.\n\n`
                    + `Fix it with \`cd-sub edit ${submissionID}\` before approving.`);
            }
            // Which BM variant? Accept it as an argument for speed, otherwise ask.
            const VARIANTS = {
                IBM: "Vaulted — not currently purchasable",
                ABM: "In rotation — buyable in the trophy shop now",
                PBM: "Prize only — never enters rotation"
            };
            let cardType = (args[2] || "").toUpperCase();
            // Optional collection after the type: approve SBM2 ABM "Rest of The World".
            // Quotes are stripped (Discord passes them through as plain text).
            let collectionArg = "";
            if (VARIANTS[cardType]) collectionArg = args.slice(3).join(" ");
            else if (args.length > 2) { collectionArg = args.slice(2).join(" "); cardType = ""; }
            collectionArg = collectionArg.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
            if (!VARIANTS[cardType]) {
                const pickRow = new ActionRowBuilder().addComponents(
                    Object.keys(VARIANTS).map(variant => new ButtonBuilder()
                        .setCustomId(`variant${variant}`)
                        .setLabel(variant)
                        .setStyle(variant === "IBM" ? ButtonStyle.Primary : ButtonStyle.Secondary))
                );
                const ask = await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0x9b59b6)
                        .setTitle(`Approving ${submissionID} — which type?`)
                        .setDescription(Object.entries(VARIANTS).map(([key, text]) => `**${key}** — ${text}`).join("\n"))],
                    components: [pickRow]
                });
                const picked = await ask.awaitMessageComponent({
                    filter: click => click.user.id === message.author.id,
                    time: 60000
                }).catch(() => null);
                await ask.edit({ components: [] }).catch(() => {});
                if (!picked) return;
                await picked.deferUpdate().catch(() => {});
                cardType = picked.customId.replace("variant", "");
            }

            const collectionName = collectionArg || submission.collectionName || "";
            if (collectionArg && collectionArg !== submission.collectionName) {
                await updateSubmission(submissionID, { collectionName: collectionArg });
            }
            let generated;
            try {
                generated = generateCarfile({ ...submission.toObject(), cardType, collectionName });
            }
            catch (error) {
                return fail(message, "Error, the carfile couldn't be written.", `\`${error.message}\``);
            }
            await updateSubmission(submissionID, {
                status: "approved",
                cardType,
                reviewedBy: message.author.id,
                reviewedAt: new Date().toISOString(),
                generatedFile: generated.path
            });
            const reached = await notifyCreator(
                { ...submission.toObject(), status: "approved" },
                "✅ Your submission was approved!",
                // `make` is an array — interpolating it directly would render
                // "TechArt,Porsche".
                `**${crName(submission, getCar(submission.reference))}** is going into the game.\n\nThanks for building it 🖤`
            );
            void feed("approved", submission, { detail: `${cardType}${collectionName ? ` · ${collectionName}` : ""}` });
            // The carfile is attached as well as written to disk: when the bot
            // runs on a remote host (PebbleHost etc.) the file lands on THAT
            // filesystem, so Discord is the only way it reaches you.
            const files = [new AttachmentBuilder(Buffer.from(formatCarfile(generated.json), "utf8"), { name: generated.filename })];
            const artwork = await artworkAttachment(submission);
            if (artwork) files.push(artwork);
            await message.channel.send({
                content: `\`${submissionID}\` — **${cardType}** carfile${artwork ? " + the artwork to upload to file.garden" : ""}, ready to drop into \`src/0 Carfiles to Add/1 BM cars/\``,
                files
            }).catch(() => {});

            return new SuccessMessage({
                channel: message.channel,
                title: `Approved ${submissionID} as ${cardType}.`,
                desc: `Staged at \`${generated.path}\` (and attached above). Collection: **${collectionName || "none"}**.\n\n`
                    + "**Still to do:** upload the art to file.garden, then\n"
                    + `\`cd-sub sethud ${submissionID} <url>\` — that re-attaches the finished file.`
                    + (reached === "nobody" ? "\n\n⚠️ The creator couldn't be notified." : ""),
                author: message.author
            }).sendMessage();
        }

        if (sub === "reject" || sub === "changes") {
            const note = args.slice(2).join(" ").trim();
            if (!note) {
                return fail(message, "Error, a reason is required.", `Example: \`cd-review ${sub} ${submissionID} the reference car is wrong\``);
            }
            if (submission.type === "edit" && sub === "changes") {
                return fail(message, "Error, suggestions can't be sent back.", "Approve it, or reject it with a reason — the suggester can always file a new one from the car's page.");
            }
            await updateSubmission(submissionID, {
                status: sub === "reject" ? "rejected" : "changes",
                reviewedBy: message.author.id,
                reviewedAt: new Date().toISOString(),
                reviewNote: note
            });
            // Must NOT say "cd-submit …" — that mints a new ID and orphans this
            // record. Editing keeps the ID. BM cards return to the queue on the
            // first edit; cars return only when the creator says `submit`, so a
            // half-fixed car never lands back in front of the reviewer.
            const howToFix = submission.type === "car"
                ? `\n\n**To fix it — same ID, no need to start over:**\n`
                    + `\`cd-sub set ${submissionID} <field> <value>\` — change one stat\n`
                    + `\`cd-sub edit ${submissionID}\` — paste the whole block again\n`
                    + `\`cd-sub image ${submissionID}\` — add or replace the artwork\n\n`
                    + `Then \`cd-sub submit ${submissionID}\` to send it back to review.`
                : `\n\n**To fix it — same ID, no need to start over:**\n`
                    + `\`cd-sub edit ${submissionID}\` — reopens the form, pre-filled\n`
                    + `\`cd-sub image ${submissionID}\` — replace the artwork\n\n`
                    + "It goes back into the review queue the moment you do.";
            // A suggestion's +1s hear the verdict too.
            const notify = submission.type === "edit" ? require("../util/functions/suggestEdit.js").notifyEveryone : notifyCreator;
            const reached = await notify(
                { ...submission.toObject(), status: sub === "reject" ? "rejected" : "changes" },
                sub === "reject" ? "❌ Your submission wasn't accepted" : "✏️ Your submission needs changes",
                `**${submissionName(submission)}**\n\n> ${note}` + (sub === "changes" ? howToFix : "")
            );
            void feed(sub === "reject" ? "rejected" : "changes", submission, { reason: note });
            return new SuccessMessage({
                channel: message.channel,
                title: `${sub === "reject" ? "Rejected" : "Sent back"} ${submissionID}.`,
                desc: `The creator was told:\n> ${note}`
                    + (reached === "nobody" ? "\n\n⚠️ They couldn't be notified." : reached === "channel" ? "\n\n(DMs closed — posted in the submissions channel.)" : ""),
                author: message.author
            }).sendMessage();
        }

        if (sub === "sethud") {
            const url = (args[2] || "").trim();
            if (!/^https?:\/\/\S+$/i.test(url)) {
                return fail(message, "Error, that isn't a URL.", `Example: \`cd-review sethud ${submissionID} https://file.garden/.../card.png\``);
            }
            if (submission.status !== "approved") {
                return fail(message, "Error, that submission isn't approved yet.", "Approve it first — the carfile has to exist before art can be attached.");
            }
            // The URL is stored on the SUBMISSION and the carfile regenerated
            // from it, rather than patched on disk — so this works identically
            // whether the bot is running locally or on a remote host where the
            // staged file isn't reachable from your machine anyway.
            const updated = await updateSubmission(submissionID, { racehud: url, finalCarID: "staged" });
            let generated;
            try {
                const plain = updated.toObject ? updated.toObject() : updated;
                generated = plain.type === "car" ? generateNormalCarfile(plain) : generateCarfile(plain);
            }
            catch (error) {
                return fail(message, "Error, the carfile couldn't be regenerated.", `\`${error.message}\``);
            }

            await message.channel.send({
                content: `\`${submissionID}\` — **${updated.cardType}** carfile, art attached, ready to add`,
                files: [new AttachmentBuilder(Buffer.from(formatCarfile(generated.json), "utf8"), { name: generated.filename })]
            }).catch(() => {});

            return new SuccessMessage({
                channel: message.channel,
                title: `Art attached to ${submissionID}.`,
                desc: `The finished carfile is attached above, and rewritten at \`${generated.path}\`.\n\n`
                    + "It'll pick up a real carID when you next run the ID scripts.",
                author: message.author
            }).sendMessage();
        }

        return fail(message, "Error, unknown subcommand.",
            "Try one of: " + module.exports.usage.join(" · "));
    },
    // exported for the test harness
    interleaveByCreator
};
