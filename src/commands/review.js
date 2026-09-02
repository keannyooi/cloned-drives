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
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { submissionArchiveChannelID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { crName } = require("../util/functions/submissionDisplay.js");
const submissionModel = require("../models/submissionSchema.js");
const { updateSubmission, rebuildMirror, purgeDevSubmissions, normalizeSubmissionID } = require("../util/functions/submissionStore.js");
const { generateCarfile, formatCarfile } = require("../util/functions/submissionCarfile.js");
const { getStagingCar, refreshStaging } = require("../util/functions/stagingCars.js");
const { previewEmbed, previewButtons, loadCandidateImages } = require("../util/functions/submissionPreview.js");
const { isAdmin, fail, summarise, notifyCreator, buildDetailEmbed, paginate, bySubmissionNumber } = require("../util/functions/submissionViews.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const BT = String.fromCharCode(96);   // backtick, for inline code in messages

module.exports = {
    name: "review",
    aliases: ["rev", "reviewsubs"],
    usage: [
        "queue [bm/art] [page]", "view <ID>", "preview <carID | ID>",
        "approve <ID> [IBM|ABM|PBM]", "reject <ID> <reason>", "changes <ID> <note>",
        "sethud <ID> <url>", "pending", "rescan", "rebuildmirror", "purgedev"
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
            const TYPE_WORDS = { bm: "bm", sbm: "bm", art: "art", saw: "art", artwork: "art" };
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
                        ? `No pending ${typeFilter === "bm" ? "BM card" : "artwork"} submissions.`
                        : "The review queue is empty.",
                    desc: typeFilter ? "The other queue might not be — `cd-review queue` shows everything." : "Nothing is waiting on you.",
                    author: message.author
                }).sendMessage();
            }
            // Numeric ID order = true submission order (a DB string sort puts
            // SAW10 before SAW2), and listUpdate gives the same page buttons
            // every other list in the bot has.
            all.sort(bySubmissionNumber);
            const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
            const { page, totalPages } = paginate(all, pageArg);
            return listUpdate(all, page, totalPages, queueDisplay, settings);

            function queueDisplay(section, page, totalPages) {
                const label = typeFilter === "bm" ? " BM cards" : typeFilter === "art" ? " artwork submissions" : "";
                return new InfoMessage({
                    channel: message.channel,
                    title: "Review queue — " + all.length + " pending" + label,
                    desc: section.map(summarise).join("\n")
                        + (typeFilter ? "" : "\n\n*Split the queue: `cd-review queue bm` · `cd-review queue art`*"),
                    author: message.author,
                    footer: "Page " + page + " of " + totalPages + " - Interact with the buttons below to navigate through pages."
                });
            }
        }

        if (sub === "pending") {
            const waiting = await submissionModel.find({ status: "approved", finalCarID: "" }).lean();
            waiting.sort(bySubmissionNumber);
            return new InfoMessage({
                channel: message.channel,
                title: waiting.length === 0 ? "Nothing is waiting on art." : `${waiting.length} approved, still needing art`,
                desc: waiting.length === 0
                    ? "Every approved submission has its final URL attached."
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

        // The staging scan is cached from startup — normally that's right, since
        // a restart is what publishes a new batch of carfiles. This re-reads the
        // folder without one, which matters when iterating.

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
            return message.channel.send({ embeds: [await buildDetailEmbed(submission)] });
        }

        if (sub === "approve") {
            if (submission.status === "approved") {
                return fail(message, "Error, that's already approved.", `Its file is \`${submission.generatedFile || "unknown"}\`.`);
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

            let generated;
            try {
                generated = generateCarfile({ ...submission.toObject(), cardType });
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
            // The carfile is attached as well as written to disk: when the bot
            // runs on a remote host (PebbleHost etc.) the file lands on THAT
            // filesystem, so Discord is the only way it reaches you.
            await message.channel.send({
                content: `\`${submissionID}\` — **${cardType}** carfile, ready to drop into \`src/0 Carfiles to Add/1 BM cars/\``,
                files: [new AttachmentBuilder(Buffer.from(formatCarfile(generated.json), "utf8"), { name: generated.filename })]
            }).catch(() => {});

            return new SuccessMessage({
                channel: message.channel,
                title: `Approved ${submissionID} as ${cardType}.`,
                desc: `Staged at \`${generated.path}\` (and attached above).\n\n`
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
            await updateSubmission(submissionID, {
                status: sub === "reject" ? "rejected" : "changes",
                reviewedBy: message.author.id,
                reviewedAt: new Date().toISOString(),
                reviewNote: note
            });
            const reached = await notifyCreator(
                { ...submission.toObject(), status: sub === "reject" ? "rejected" : "changes" },
                sub === "reject" ? "❌ Your submission wasn't accepted" : "✏️ Your submission needs changes",
                `**${crName(submission, submission.reference ? getCar(submission.reference) : null)}**\n\n> ${note}`
                    // Must NOT say "cd-submit bm" — that mints a new ID and
                    // orphans this record. Editing keeps the ID and puts it
                    // straight back in the queue.
                    + (sub === "changes"
                        ? `\n\n**To fix it — same ID, no need to start over:**\n`
                            + `\`cd-sub edit ${submissionID}\` — reopens the form, pre-filled\n`
                            + `\`cd-sub image ${submissionID}\` — replace the artwork\n\n`
                            + "It goes back into the review queue the moment you do."
                        : "")
            );
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
                generated = generateCarfile(updated.toObject ? updated.toObject() : updated);
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
    }
};
