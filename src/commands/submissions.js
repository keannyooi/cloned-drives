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
const { stagingCrName, archiveLabel } = require("../util/functions/submissionDisplay.js");
const submissionModel = require("../models/submissionSchema.js");
const profileModel = require("../models/profileSchema.js");
const { updateSubmission, normalizeSubmissionID, SUBMISSIONS_DIR } = require("../util/functions/submissionStore.js");
const { resolveReference, resolveMake } = require("./submit.js");
const { validateAttachment, archiveSubmissionImage } = require("../util/functions/submissionImage.js");
const { getStagingCars } = require("../util/functions/stagingCars.js");
const listUpdate = require("../util/functions/listUpdate.js");
const { isAdmin, fail, searchSubmissions, summarise, buildDetailEmbed, paginate } = require("../util/functions/submissionViews.js");
const BT = String.fromCharCode(96);   // backtick, for inline code in messages

module.exports = {
    name: "submissions",
    aliases: ["subs", "sub"],
    usage: [
        "mine [page]", "view <ID>", "missing [search] [page]",
        "search <query> [--all] [--mine]", "collection <name> [--all]",
        "edit <ID>", "image <ID>", "set <ID> <country|year> <value>",
        "withdraw <ID>", "export <ID>"
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
            const list = await submissionModel.find({ creatorID: message.author.id })
                .sort({ submissionID: 1 }).lean();
            if (list.length === 0) {
                return new InfoMessage({
                    channel: message.channel,
                    title: "You have not submitted anything yet.",
                    desc: "Design a Black Market card with " + BT + "cd-submit bm" + BT + ", or make artwork for a car that needs it — see " + BT + "cd-sub missing" + BT + ".",
                    author: message.author
                }).sendMessage();
            }

            const { settings } = await profileModel.findOne({ userID: message.author.id });
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
            if (flags.has("--mine")) filter.creatorID = message.author.id;

            const all = await submissionModel.find(filter).sort({ submissionID: 1 }).lean();
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
            const query = args.slice(1).filter(a => !/^\d+$/.test(a)).join(" ").trim().toLowerCase();
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

            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const perPage = settings.listamount || defaultPageLimit;
            const totalPages = Math.ceil(list.length / perPage);
            const page = parseInt(args[args.length - 1]) || 1;
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


        if (sub === "view") {
            return message.channel.send({ embeds: [await buildDetailEmbed(submission)] });
        }

        const isOwner = submission.creatorID === message.author.id;
        if (["edit", "withdraw", "set", "image"].includes(sub) && !isOwner && !(await isAdmin(message))) {
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
            return new SuccessMessage({
                channel: message.channel,
                title: `Withdrew ${submissionID}.`,
                desc: "It's out of the review queue. The record and its image are kept, so it can be restored if you change your mind.",
                author: message.author
            }).sendMessage();
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
