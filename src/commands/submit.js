"use strict";

/**
 * CREATOR SUBMISSIONS — cd-submit
 * ===============================
 * Runs the Black Market questionnaire and files the result.
 *
 * Flow: button → modal (5 fields) → resolve the reference car and auto-fill
 * everything derivable from it → wait for the image in-channel → archive it →
 * preview → confirm → mint an ID, save to Mongo, mirror to disk.
 *
 * Everything is collector-based (per-message, temporary), so this needs no
 * global interaction listener and nothing here survives a restart by design —
 * an abandoned questionnaire simply expires.
 */

const bot = require("../config/config.js");
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const { findBestMatch } = require("string-similarity");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { submissionArchiveChannelID, artSubmitterRoleID, defaultChoiceTime } = require("../util/consts/consts.js");
const { hasRole } = require("../util/functions/submissionViews.js");
const { getCar, getCarFiles } = require("../util/functions/dataManager.js");
const { isBMCar } = require("../util/functions/cardType.js");
const carNameGen = require("../util/functions/carNameGen.js");
const { crName, archiveLabel } = require("../util/functions/submissionDisplay.js");
const { createSubmission, mirrorToDisk } = require("../util/functions/submissionStore.js");
const { validateAttachment, archiveSubmissionImage } = require("../util/functions/submissionImage.js");
const { runArtSubmission } = require("../util/functions/submitArt.js");

// How long each stage waits before giving up on the submitter.
const FORM_TIMEOUT = 5 * 60 * 1000;
const IMAGE_TIMEOUT = 5 * 60 * 1000;
/**
 * Hard ceiling on the WHOLE questionnaire.
 *
 * index.js holds bot.execList for the entire duration of execute(), so a
 * creator running this can't use any other command until it finishes — and
 * the "1 command at a time" error promises it clears in 30 seconds. Without a
 * ceiling, the per-stage timeouts stack (and the override loop refreshes the
 * confirm timer on every click), so someone could hold their own lock
 * indefinitely. Every wait below is clamped to whatever is left of this.
 */
const SESSION_BUDGET = 10 * 60 * 1000;
// Below this similarity we assume the base car simply isn't in the game yet
// rather than pretending a bad match is what they meant.
const MATCH_FLOOR = 0.45;

/** Resolve free text to a real car: exact carID first, then fuzzy on name. */
function resolveReference(input) {
    const trimmed = (input || "").trim();
    if (/^c\d{5}$/i.test(trimmed)) {
        const car = getCar(trimmed.toLowerCase());
        if (car) return { car, carID: trimmed.toLowerCase(), confident: true };
    }

    // Fuzzy over non-BM cars only — a BM card can't be another BM card's base.
    const candidates = [];
    for (const file of getCarFiles()) {
        const carID = file.slice(0, -5);
        const car = getCar(carID);
        if (!car || isBMCar(car)) continue;
        candidates.push({ carID, name: carNameGen({ currentCar: car, removePrizeTag: true }) });
    }
    if (candidates.length === 0) return { car: null, carID: "", confident: false };

    const match = findBestMatch(trimmed.toLowerCase(), candidates.map(entry => entry.name.toLowerCase()));
    const best = candidates[match.bestMatchIndex];
    if (match.bestMatch.rating < MATCH_FLOOR) return { car: null, carID: "", confident: false };
    return { car: getCar(best.carID), carID: best.carID, confident: true, rating: match.bestMatch.rating };
}

const makeOf = car => (Array.isArray(car.make) ? car.make : [car.make]).filter(Boolean);

/**
 * `make` is an array of [sub-brand, …, parent brand] — ["Mercedes-AMG",
 * "Mercedes-Benz"], ["TechArt", "Porsche"]. The parent is what the game sorts
 * and filters by, so it must never be dropped.
 *
 * Blank override      → the reference car's chain verbatim (already correct)
 * "TechArt"           → sub-brand only, so the reference's parent is kept
 *                       behind it: ["TechArt", "Porsche"]
 * "Abarth, Fiat"      → an explicit chain, taken as given
 */
function resolveMake(brandOverride, referenceCar) {
    const base = referenceCar ? makeOf(referenceCar) : [];
    const override = (brandOverride || "").trim();
    if (!override) return base;

    const parts = override.split(",").map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts;

    const parent = base.length > 0 ? base[base.length - 1] : null;
    return parent && parent.toLowerCase() !== parts[0].toLowerCase()
        ? [parts[0], parent]
        : [parts[0]];
}

/** Preview embed — the same view the reviewer will eventually see. */
function previewEmbed(draft, resolved, imageURL) {
    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        // Same shape as cd-carinfo: "(<rarity> <CR>) Make Model".
        .setTitle(crName(draft, resolved.car))
        .addFields(
            {
                name: "Based on",
                value: resolved.car
                    ? `\`${resolved.carID}\` — ${carNameGen({ currentCar: resolved.car, removePrizeTag: true })}`
                    : `⚠️ **Not in the game yet** — "${draft.referenceName}"\nThis can't be approved until the base car is added.`
            },
            { name: "Brand", value: draft.make.join(", ") || "—", inline: true },
            { name: "Year", value: String(draft.modelYear || "—"), inline: true },
            { name: "Country", value: draft.country || "—", inline: true }
        );
    if (draft.collectionName) {
        embed.addFields({ name: "Collection", value: draft.collectionName });
    }
    // Description sits at the bottom, closest to the art it describes.
    embed.addFields({ name: "Description", value: draft.description || "*(none)*" });
    if (imageURL) embed.setImage(imageURL);
    return embed;
}

module.exports = {
    name: "submit",
    aliases: ["submitcar"],
    usage: ["bm", "art <car name>"],
    args: 0,
    category: "Miscellaneous",
    description: "Submit a Black Market card design, or artwork for a car that's waiting on one.",
    async execute(message, args) {
        // ── configuration guards ─────────────────────────────────────────────
        // Gated by ROLE, not by channel — submissions run in DMs so creators
        // aren't all crowding one channel with half-finished forms and images.
        if (!(await hasRole(message, artSubmitterRoleID))) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, you can't submit right now.",
                desc: artSubmitterRoleID
                    ? `Submissions are limited to <@&${artSubmitterRoleID}>.`
                    : "`artSubmitterRoleID` needs filling in inside `src/util/consts/consts.js`.",
                author: message.author
            }).sendMessage();
        }
        if (!submissionArchiveChannelID) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, submissions aren't set up yet.",
                desc: "`submissionArchiveChannelID` needs filling in inside `src/util/consts/consts.js`.",
                author: message.author
            }).sendMessage();
        }
        const type = (args[0] || "").toLowerCase();
        if (type === "art") {
            // Artwork for a car that already exists as a staged carfile —
            // a much shorter flow, so it lives in its own module.
            return runArtSubmission(message, args.slice(1));
        }
        if (type !== "bm") {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, what are you submitting?",
                desc: "`cd-submit bm` — a new Black Market card design\n"
                    + "`cd-submit art <car>` — artwork for a car that's waiting on one\n\n"
                    + "See what needs artwork with `cd-sub missing`.",
                author: message.author
            }).sendMessage();
        }

        // Clamp every wait to what's left of the session budget. Floored at 1ms
        // rather than 0 because discord.js treats time: 0 as NO timeout — an
        // exhausted budget must expire instantly, not hang forever, and every
        // stage already handles a null (timed-out) result as "give up".
        const deadline = Date.now() + SESSION_BUDGET;
        const budget = perStage => Math.max(1, Math.min(perStage, deadline - Date.now()));

        // ── stage 1: open the form ───────────────────────────────────────────
        const startRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("submitOpenForm").setLabel("Open the form").setEmoji("📝").setStyle(ButtonStyle.Primary)
        );
        const intro = await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle("🖤 Black Market submission")
                .setDescription(
                    "You'll be asked for **5 things**, then for your card image.\n\n"
                    + "Most of the card fills itself in from the car yours is based on, so keep that name handy — "
                    + "a carID like `c00058` is ideal, but the name works too."
                )],
            components: [startRow]
        });

        const buttonInteraction = await intro.awaitMessageComponent({
            filter: interaction => interaction.user.id === message.author.id,
            time: budget(defaultChoiceTime)
        }).catch(() => null);

        if (!buttonInteraction) {
            await intro.edit({ components: [] }).catch(() => {});
            return;
        }

        // ── stage 2: the modal ───────────────────────────────────────────────
        const modal = new ModalBuilder()
            .setCustomId(`submitForm-${message.id}`)
            .setTitle("Black Market submission")
            .addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("reference").setLabel("Which car is yours based on?")
                    .setPlaceholder("c00058, or \"Aston Martin Cygnet\"")
                    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("model").setLabel("Name of YOUR card")
                    .setPlaceholder("Cygnet Launch Edition White")
                    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("make").setLabel("Brand (blank = same as the base car)")
                    .setPlaceholder("Tuner? Just \"TechArt\" — the parent brand is kept for you")
                    .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("collection").setLabel("Collection (optional)")
                    .setPlaceholder("Summer Games 2026")
                    .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("description").setLabel("Description")
                    .setPlaceholder("The blurb that appears on the card.")
                    .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
            );

        await buttonInteraction.showModal(modal);
        const submitted = await buttonInteraction.awaitModalSubmit({
            filter: interaction => interaction.customId === `submitForm-${message.id}` && interaction.user.id === message.author.id,
            time: budget(FORM_TIMEOUT)
        }).catch(() => null);

        await intro.edit({ components: [] }).catch(() => {});
        if (!submitted) return;

        // ── stage 3: resolve + auto-fill ─────────────────────────────────────
        const rawReference = submitted.fields.getTextInputValue("reference");
        const resolved = resolveReference(rawReference);
        const brandOverride = submitted.fields.getTextInputValue("make").trim();

        const draft = {
            type: "bm",
            creatorID: message.author.id,
            creatorTag: message.author.username,
            referenceKnown: !!resolved.car,
            reference: resolved.carID,
            referenceName: resolved.car ? "" : rawReference.trim(),
            make: resolveMake(brandOverride, resolved.car),
            model: submitted.fields.getTextInputValue("model").trim(),
            modelYear: resolved.car ? resolved.car.modelYear : 0,
            country: resolved.car ? resolved.car.country : "",
            collectionName: submitted.fields.getTextInputValue("collection").trim(),
            description: submitted.fields.getTextInputValue("description").trim(),
            cardType: "IBM"
        };

        await submitted.reply({
            embeds: [previewEmbed(draft, resolved, null).setFooter({ text: "Step 2 of 2 — now post your card image in this channel." })],
            content: "📷 **Post your card image here now.** PNG, JPEG or WebP, at least 400px wide."
        });

        // ── stage 4: the image ───────────────────────────────────────────────
        const collected = await message.channel.awaitMessages({
            filter: msg => msg.author.id === message.author.id && msg.attachments.size > 0,
            max: 1,
            time: budget(IMAGE_TIMEOUT)
        });
        const imageMessage = collected.first();
        if (!imageMessage) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Submission cancelled — no image arrived in time.",
                desc: "Nothing was saved. Run `cd-submit bm` again when your art is ready.",
                author: message.author
            }).sendMessage();
        }

        const attachment = imageMessage.attachments.first();
        const check = validateAttachment(attachment);
        if (!check.ok) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Submission cancelled — that image can't be used.",
                desc: `${check.reason}\n\nNothing was saved. Run \`cd-submit bm\` again with a different file.`,
                author: message.author
            }).sendMessage();
        }

        // ── stage 5: confirm ─────────────────────────────────────────────────
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("submitConfirm").setLabel("Submit").setEmoji("✅").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("submitOverride").setLabel("Country / Year").setEmoji("🌍").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("submitCancel").setLabel("Cancel").setEmoji("✖️").setStyle(ButtonStyle.Danger)
        );
        const preview = await message.channel.send({
            content: `<@${message.author.id}> — last look before this goes to the review queue.`,
            embeds: [previewEmbed(draft, resolved, attachment.url)],
            components: [confirmRow]
        });

        // Country and year are inherited from the base car and are right
        // almost always — but the main modal is already at Discord's 5-input
        // ceiling, so overriding them lives behind its own button. Looping
        // here lets the creator adjust as many times as they like before
        // committing.
        let decision = null;
        while (true) {
            const interaction = await preview.awaitMessageComponent({
                filter: click => click.user.id === message.author.id,
                time: budget(defaultChoiceTime)
            }).catch(() => null);

            if (!interaction || interaction.customId !== "submitOverride") {
                decision = interaction;
                break;
            }

            const overrideModal = new ModalBuilder()
                .setCustomId(`submitOverride-${message.id}`)
                .setTitle("Override country / year")
                .addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("country").setLabel("Country code")
                        .setValue(draft.country || "").setPlaceholder("DE, GB, IT, JP …")
                        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("year").setLabel("Model year")
                        .setValue(String(draft.modelYear || "")).setPlaceholder("2017")
                        .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4))
                );
            await interaction.showModal(overrideModal);
            const override = await interaction.awaitModalSubmit({
                filter: submitted2 => submitted2.customId === `submitOverride-${message.id}` && submitted2.user.id === message.author.id,
                time: budget(FORM_TIMEOUT)
            }).catch(() => null);
            if (!override) continue;

            const problems = [];
            const country = override.fields.getTextInputValue("country").trim().toUpperCase();
            const rawYear = override.fields.getTextInputValue("year").trim();
            if (country) {
                if (/^[A-Z]{2,3}$/.test(country)) draft.country = country;
                else problems.push(`\`${country}\` isn't a country code — 2 or 3 letters, like \`DE\`.`);
            }
            if (rawYear) {
                const year = parseInt(rawYear, 10);
                if (Number.isInteger(year) && year >= 1885 && year <= 2100) draft.modelYear = year;
                else problems.push(`\`${rawYear}\` isn't a usable year.`);
            }

            await override.reply({
                content: problems.length > 0 ? `⚠️ ${problems.join(" ")}` : "✅ Updated.",
                ephemeral: true
            }).catch(() => {});
            await preview.edit({ embeds: [previewEmbed(draft, resolved, attachment.url)] }).catch(() => {});
        }

        await preview.edit({ components: [] }).catch(() => {});
        if (!decision || decision.customId === "submitCancel") {
            return new ErrorMessage({
                channel: message.channel,
                title: decision ? "Submission cancelled." : "Submission timed out.",
                desc: "Nothing was saved.",
                author: message.author
            }).sendMessage();
        }
        await decision.deferUpdate().catch(() => {});

        // ── stage 6: mint, archive, save ─────────────────────────────────────
        // The ID is minted BEFORE archiving so the archive post can carry it.
        // A failure after this point burns an ID — harmless, and far better
        // than recording a submission whose image was never captured.
        try {
            const pending = await createSubmission(draft);
            const label = archiveLabel(pending.submissionID, draft, resolved.car);
            let archived;
            try {
                archived = await archiveSubmissionImage(attachment, pending.submissionID, label);
            }
            catch (archiveError) {
                // Roll the record back so a half-submission never sits in the
                // queue with no art.
                await pending.deleteOne().catch(() => {});
                throw archiveError;
            }

            pending.imageArchiveChannelID = archived.channelID;
            pending.imageArchiveMessageID = archived.messageID;
            pending.imageLocalPath = archived.localPath;
            pending.imageWidth = archived.width;
            pending.imageHeight = archived.height;
            await pending.save();
            mirrorToDisk(pending);

            return new SuccessMessage({
                channel: message.channel,
                title: `Submitted! Your ID is ${pending.submissionID}`,
                desc: `**${label}** is in the review queue.\n\n`
                    + `Quote \`${pending.submissionID}\` if you need to ask about it.`
                    + (draft.referenceKnown
                        ? ""
                        : `\n\n⚠️ The car yours is based on isn't in the game yet, so this can't be approved until it is.`),
                author: message.author
            }).sendMessage();
        }
        catch (error) {
            console.log(`[Submissions] submission failed for ${message.author.id}: ${error.stack}`);
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, your submission couldn't be saved.",
                desc: `\`${error.message}\`\n\nNothing was filed — please try again, and tell an admin if it keeps happening.`,
                author: message.author
            }).sendMessage();
        }
    },
    // exported for the test harness
    resolveReference,
    resolveMake
};
