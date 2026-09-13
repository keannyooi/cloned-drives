"use strict";

/**
 * CAR SUBMISSIONS — cd-submit car
 * ===============================
 * A whole car proposed from scratch, by someone with no access to the files.
 *
 * Flow: template → the creator pastes it back filled in (or attaches a file)
 * → parse + validate, looping until it's clean → preview with the computed
 * CR → Submit / Save as draft / Attach image / Cancel → mint an ID, save,
 * mirror, feed.
 *
 * Deliberately a PASTE and not a form: Discord modals stop at five inputs and
 * a car has twenty fields. The paste is ~500 characters, human-readable, and
 * the spreadsheet the team already uses can generate it (or its old JSON
 * output can be pasted as-is — the parser repairs the doubled quotes).
 *
 * One car per submission ID. A file, or a paste holding several cars, is
 * bulk INTAKE: each car becomes its own draft, reviewed on its own.
 *
 * Everything the creator could get wrong is derived, not typed: CR from the
 * formula, carID and cardType from the pipeline and the reviewer, creator
 * from Discord.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { ErrorMessage, SuccessMessage } = require("../classes/classes.js");
const { defaultChoiceTime, artSubmitterRoleIDs, submissionArchiveChannelID } = require("../consts/consts.js");
const { hasRole, isAdmin, buildCarEmbed, feed, mirrorFields, formatDate } = require("./submissionViews.js");
const { parseCarSubmissionText, TEMPLATE } = require("./carSubmissionParser.js");
const { validateCarSubmission, describeReport } = require("./carSubmissionValidator.js");
const { createSubmission, mirrorToDisk } = require("./submissionStore.js");
const { validateAttachment, archiveSubmissionImage } = require("./submissionImage.js");
const { archiveLabel, carCrName } = require("./submissionDisplay.js");
const { newDeadline, draftAutoSubmitDays } = require("./submissionDrafts.js");

const PASTE_TIMEOUT = 10 * 60 * 1000;
const IMAGE_TIMEOUT = 5 * 60 * 1000;
// index.js holds bot.execList for the whole of execute(), so the session has
// a hard ceiling — same reasoning as the BM questionnaire, a little longer
// because pasting a block and fixing it takes more than clicking a form.
const SESSION_BUDGET = 15 * 60 * 1000;
const MAX_TRIES = 6;
const MAX_FILE_BYTES = 512 * 1024;
const TEXT_FILE = /\.(txt|csv|json|md)$/i;

const isTextAttachment = attachment => {
    const type = (attachment.contentType || "").split(";")[0].toLowerCase();
    return TEXT_FILE.test(attachment.name || "") || type.startsWith("text/") || type === "application/json";
};

async function readTextAttachment(attachment) {
    if (attachment.size > MAX_FILE_BYTES) {
        throw new Error(`that file is ${Math.round(attachment.size / 1024)} KB — the limit is ${MAX_FILE_BYTES / 1024} KB`);
    }
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`download failed (HTTP ${response.status})`);
    return response.text();
}

/** Mid-flow messages go straight to the channel — the *Message classes release the command lock when they send. */
function note(message, colour, title, desc) {
    return message.channel.send({
        embeds: [new EmbedBuilder().setColor(colour).setTitle(title).setDescription(desc.slice(0, 4000))]
    }).catch(() => null);
}

/**
 * Wait for the creator's paste (or file) and validate it, looping until it's
 * clean, cancelled, or out of tries/time.
 *
 * @param {Message} message
 * @param {Object} options
 * @param {number} options.deadline    epoch ms the whole session must end by
 * @param {boolean} options.admin      validate with reviewer privileges
 * @param {boolean} options.allowBulk  a file or multi-car paste is accepted (→ drafts)
 * @returns {Promise<{kind: "single", report: Object} | {kind: "bulk", results: Array} | {kind: "cancelled"} | {kind: "timeout"}>}
 */
async function collectCarPaste(message, { deadline, admin, allowBulk }) {
    const budget = perStage => Math.max(1, Math.min(perStage, deadline - Date.now()));
    let tries = 0;

    while (tries < MAX_TRIES) {
        const collected = await message.channel.awaitMessages({
            filter: msg => msg.author.id === message.author.id && (msg.content.trim() !== "" || msg.attachments.size > 0),
            max: 1,
            time: budget(PASTE_TIMEOUT)
        });
        const reply = collected.first();
        if (!reply) return { kind: "timeout" };
        if (/^cancel$/i.test(reply.content.trim())) return { kind: "cancelled" };
        tries++;
        const triesLeft = MAX_TRIES - tries;

        // ── what did they send? ──
        let text = reply.content;
        let fromFile = false;
        const attachment = reply.attachments.first();
        if (attachment) {
            if (!isTextAttachment(attachment)) {
                await note(message, 0xfc7703, "Stats first, image after.",
                    "That looks like an image. Paste the stat block first — you'll get an **Attach image** button on the preview.");
                tries--;      // not a real attempt
                continue;
            }
            if (!allowBulk) {
                await note(message, 0xfc7703, "Paste the block as text here.", "A file is for submitting several cars at once, which this isn't.");
                continue;
            }
            try {
                text = await readTextAttachment(attachment);
                fromFile = true;
            }
            catch (error) {
                await note(message, 0xfc7703, "Couldn't read that file.", `${error.message}. Try again, or paste the block as text.`);
                continue;
            }
        }

        const parsed = parseCarSubmissionText(text);
        if (parsed.cars.length === 0) {
            await note(message, 0xfc7703, "No car fields found in that.",
                "Paste the template back with the values filled in — every line is `field: value`. Type `cancel` to stop."
                + `\n\n*${triesLeft} tr${triesLeft === 1 ? "y" : "ies"} left.*`);
            continue;
        }

        // ── bulk: several cars → each one is judged on its own ──
        if (parsed.cars.length > 1 || fromFile) {
            if (!allowBulk) {
                await note(message, 0xfc7703, "One car at a time here.", "That paste holds several cars. Send just one of them.");
                continue;
            }
            const results = parsed.cars.map(entry => ({
                index: entry.index,
                report: validateCarSubmission(entry.fields, { isAdmin: admin, unknownKeys: entry.unknownKeys }),
                fields: entry.fields
            }));
            if (!results.some(result => result.report.ok)) {
                await note(message, 0xfc7703, `None of the ${results.length} cars validated.`,
                    results.slice(0, 5).map(result => bulkLine(result)).join("\n\n")
                    + `\n\nFix them and send the file again, or type \`cancel\`. *${triesLeft} left.*`);
                continue;
            }
            return { kind: "bulk", results };
        }

        // ── single car ──
        const entry = parsed.cars[0];
        const report = validateCarSubmission(entry.fields, { isAdmin: admin, unknownKeys: entry.unknownKeys });
        if (report.ok) return { kind: "single", report };

        const lines = describeReport(report);
        await note(message, 0xe74c3c, `That paste needs fixing (${report.blockers.length} problem${report.blockers.length === 1 ? "" : "s"}).`,
            lines.join("\n") + `\n\nPaste the **whole block** again with those fixed, or type \`cancel\`. *${triesLeft} tr${triesLeft === 1 ? "y" : "ies"} left.*`);
    }
    return { kind: "timeout" };
}

function bulkLine(result) {
    const car = result.report.car || {};
    const label = car.make && car.model ? `${car.make[0]} ${car.model} (${car.modelYear || "?"})` : `car #${result.index + 1}`;
    if (result.report.ok) return `✅ **${label}** — CR ${car.cr}`;
    return `❌ **${label}**\n` + result.report.blockers.slice(0, 3).map(entry => `   ${entry.message}`).join("\n")
        + (result.report.blockers.length > 3 ? `\n   …and ${result.report.blockers.length - 3} more` : "");
}

/** Create one car submission (pending or draft) from a validated car. */
async function fileCar(message, car, { asDraft }) {
    return createSubmission({
        type: "car",
        creatorID: message.author.id,
        creatorTag: message.author.username,
        ...mirrorFields(car),
        carData: car,
        status: asDraft ? "draft" : "pending",
        draftDeadline: asDraft ? newDeadline() : ""
    });
}

/**
 * @param {Message} message - the invoking message
 * @param {string[]} args - args AFTER "car" (unused for now)
 */
async function runCarSubmission(message) {
    const fail = (title, desc) => new ErrorMessage({ channel: message.channel, title, desc, author: message.author }).sendMessage();

    if (!(await hasRole(message, artSubmitterRoleIDs))) {
        return fail("Error, you can't submit right now.",
            `Submissions are limited to ${artSubmitterRoleIDs.map(id => `<@&${id}>`).join(" / ")}.`);
    }
    const admin = await isAdmin(message);
    const deadline = Date.now() + SESSION_BUDGET;
    const budget = perStage => Math.max(1, Math.min(perStage, deadline - Date.now()));

    // ── stage 1: the template ────────────────────────────────────────────────
    await message.channel.send({
        embeds: [new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("🚗 New car submission")
            .setDescription(
                "Copy the template, fill it in, and paste it back here.\n"
                + "```\n" + TEMPLATE + "\n```\n"
                + "`power` is optional — PS, hp or kW (say which). Leave it blank and the game estimates one from the other stats.\n"
                + "**What's derived, not typed:** CR (from the stats), carID, card type, artwork URL.\n"
                + "**Tags** must already exist in the game. **Country** is a two-letter code.\n"
                + "Spelling is forgiving — `perf` reads as Performance — and anything the bot changes, it tells you.\n\n"
                + "Several cars? Attach a `.txt` of blocks separated by `---`, or a `.csv` with those field names as headers — "
                + "each becomes a private **draft** you send when it's ready.\n"
                + "Type `cancel` to stop."
            )]
    });

    // ── stage 2: the paste ───────────────────────────────────────────────────
    const collected = await collectCarPaste(message, { deadline, admin, allowBulk: true });
    if (collected.kind === "cancelled") return fail("Submission cancelled.", "Nothing was saved.");
    if (collected.kind === "timeout") return fail("Submission timed out.", "Nothing was saved. Run `cd-submit car` again when you're ready.");

    // ── bulk → drafts ────────────────────────────────────────────────────────
    if (collected.kind === "bulk") {
        const lines = [];
        let saved = 0;
        for (const result of collected.results) {
            if (!result.report.ok) { lines.push(bulkLine(result)); continue; }
            try {
                const draft = await fileCar(message, result.report.car, { asDraft: true });
                saved++;
                lines.push(`📝 \`${draft.submissionID}\` **${carCrName(draft)}**`);
            }
            catch (error) {
                console.log(`[Submissions] bulk draft failed for ${message.author.id}: ${error.stack}`);
                lines.push(`${bulkLine(result)}\n   *couldn't be saved: ${error.message}*`);
            }
        }
        const failed = collected.results.length - saved;
        return new SuccessMessage({
            channel: message.channel,
            title: `Saved ${saved} draft${saved === 1 ? "" : "s"}${failed ? ` (${failed} didn't validate)` : ""}.`,
            desc: lines.join("\n").slice(0, 3500)
                + `\n\nDrafts are private. \`cd-sub image <ID>\` to add art, \`cd-sub submit <ID>\` to send one, `
                + `\`cd-sub submit all\` for the lot. Left alone, each goes to review after ${draftAutoSubmitDays} days.`,
            author: message.author
        }).sendMessage();
    }

    // ── stage 3: preview + decision ──────────────────────────────────────────
    const { report } = collected;
    const car = report.car;
    const standIn = { creatorID: message.author.id, creatorTag: message.author.username, ...mirrorFields(car), carData: car, crOverride: 0 };
    let attachment = null;

    const rowFor = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("carSubmit").setLabel("Submit").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("carDraft").setLabel("Save as draft").setEmoji("📝").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("carImage").setLabel(attachment ? "Replace image" : "Attach image").setEmoji("📷").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("carCancel").setLabel("Cancel").setEmoji("✖️").setStyle(ButtonStyle.Danger)
    );
    const previewPayload = () => ({
        content: `<@${message.author.id}> — last look. **Submit** sends it to review now. **Save as draft** keeps it private for ${draftAutoSubmitDays} days.`,
        embeds: [buildCarEmbed(standIn, { imageURL: attachment ? attachment.url : null, report, preview: true })],
        components: [rowFor()]
    });
    const preview = await message.channel.send(previewPayload());

    let decision = null;
    while (true) {
        const interaction = await preview.awaitMessageComponent({
            filter: click => click.user.id === message.author.id,
            time: budget(defaultChoiceTime)
        }).catch(() => null);

        if (!interaction || interaction.customId !== "carImage") {
            decision = interaction;
            break;
        }

        await interaction.deferUpdate().catch(() => {});
        if (!submissionArchiveChannelID) {
            await note(message, 0xfc7703, "Images can't be archived right now.", "`submissionArchiveChannelID` isn't set — submit without one and add it later with `cd-sub image`.");
            continue;
        }
        const prompt = await message.channel.send({ content: `📷 **Post the image now.** PNG, JPEG or WebP, at least 400px wide.` });
        const images = await message.channel.awaitMessages({
            filter: msg => msg.author.id === message.author.id && msg.attachments.size > 0,
            max: 1,
            time: budget(IMAGE_TIMEOUT)
        });
        await prompt.delete().catch(() => {});
        const imageMessage = images.first();
        if (!imageMessage) {
            await note(message, 0xfc7703, "No image arrived.", "The preview is still open — you can try again or submit without one.");
            continue;
        }
        const candidate = imageMessage.attachments.first();
        const check = validateAttachment(candidate);
        if (!check.ok) {
            await note(message, 0xfc7703, "That image can't be used.", check.reason);
            continue;
        }
        attachment = candidate;
        await preview.edit(previewPayload()).catch(() => {});
    }

    await preview.edit({ components: [] }).catch(() => {});
    if (!decision || decision.customId === "carCancel") {
        return fail(decision ? "Submission cancelled." : "Submission timed out.", "Nothing was saved.");
    }
    await decision.deferUpdate().catch(() => {});
    const asDraft = decision.customId === "carDraft";

    // ── stage 4: mint, archive, save, feed ───────────────────────────────────
    try {
        const saved = await fileCar(message, car, { asDraft });
        if (attachment) {
            let archived;
            try {
                archived = await archiveSubmissionImage(attachment, saved.submissionID, archiveLabel(saved.submissionID, saved, null));
            }
            catch (archiveError) {
                await saved.deleteOne().catch(() => {});
                throw archiveError;
            }
            saved.imageArchiveChannelID = archived.channelID;
            saved.imageArchiveMessageID = archived.messageID;
            saved.imageLocalPath = archived.localPath;
            saved.imageWidth = archived.width;
            saved.imageHeight = archived.height;
            await saved.save();
            mirrorToDisk(saved);
        }
        if (!asDraft) void feed("submitted", saved);

        const id = saved.submissionID;
        if (asDraft) {
            return new SuccessMessage({
                channel: message.channel,
                title: `Saved as a draft — ${id}`,
                desc: `**${carCrName(saved)}** is private until you send it.\n\n`
                    + `\`cd-sub submit ${id}\` when it's ready · \`cd-sub image ${id}\` to add the art · `
                    + `\`cd-sub set ${id} <field> <value>\` to tweak a stat · \`cd-sub snooze ${id}\` for another ${draftAutoSubmitDays} days.\n\n`
                    + `Left alone, it goes to review as it is on **${formatDate(saved.draftDeadline)}**.`,
                author: message.author
            }).sendMessage();
        }
        return new SuccessMessage({
            channel: message.channel,
            title: `Submitted! Your ID is ${id}`,
            desc: `**${carCrName(saved)}** is in the review queue.\n\n`
                + `\`cd-sub view ${id}\` to see it · \`cd-sub set ${id} <field> <value>\` to tweak a stat · `
                + (attachment ? `\`cd-sub image ${id}\` to swap the picture` : `\`cd-sub image ${id}\` to add artwork before it's reviewed`)
                + ` · \`cd-sub withdraw ${id}\` to pull it.`,
            author: message.author
        }).sendMessage();
    }
    catch (error) {
        console.log(`[Submissions] car submission failed for ${message.author.id}: ${error.stack}`);
        return fail("Error, your submission couldn't be saved.",
            `\`${error.message}\`\n\nNothing was filed — please try again, and tell an admin if it keeps happening.`);
    }
}

module.exports = { runCarSubmission, collectCarPaste, isTextAttachment, readTextAttachment };
