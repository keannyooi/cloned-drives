"use strict";

/**
 * ART SUBMISSIONS — cd-submit art
 * ===============================
 * Propose artwork for a car that's already been written as a staged carfile
 * but has no `racehud` yet.
 *
 * Much shorter than the BM questionnaire: the car already exists, so every
 * detail is known. It's pick-a-car → post-an-image → confirm.
 *
 * Several creators submitting for the same car is expected and wanted — the
 * admin picks the one they like, and the rest close automatically.
 */

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require("discord.js");
const { findBestMatch } = require("string-similarity");
const { ErrorMessage, SuccessMessage } = require("../classes/classes.js");
const { defaultChoiceTime, artSubmitterRoleID } = require("../consts/consts.js");
const { getOpenForArt } = require("./stagingCars.js");
const { hasRole } = require("./submissionViews.js");
const { stagingCrName } = require("./submissionDisplay.js");
const { createSubmission } = require("./submissionStore.js");
const { validateAttachment, archiveSubmissionImage } = require("./submissionImage.js");
const submissionModel = require("../../models/submissionSchema.js");

const IMAGE_TIMEOUT = 5 * 60 * 1000;
// Same reasoning as cd-submit bm: index.js holds bot.execList for the whole of
// execute(), so the command can't be allowed to run unbounded.
const SESSION_BUDGET = 8 * 60 * 1000;
const MATCH_FLOOR = 0.4;

/** Fuzzy-resolve free text against the cars currently awaiting art. */
function resolveTarget(query) {
    // Only cars genuinely awaiting artwork — BM cards in staging already have
    // art and are just waiting on the admin's file.garden upload.
    const needsArt = getOpenForArt();
    if (needsArt.length === 0) return { car: null, empty: true };

    const needle = query.trim().toLowerCase();
    // Staged cars now carry real carIDs, so an exact ID is unambiguous.
    if (/^c\d{5}$/.test(needle)) {
        const byID = needsArt.find(car => car.key === needle);
        return byID ? { car: byID } : { car: null };
    }
    // A substring hit beats fuzzy scoring — "amalfi" should find the Amalfi
    // even though it's a small fraction of the full name.
    const contains = needsArt.filter(car => car.name.toLowerCase().includes(needle));
    if (contains.length === 1) return { car: contains[0] };
    if (contains.length > 1) return { car: null, ambiguous: contains };

    const match = findBestMatch(needle, needsArt.map(car => car.name.toLowerCase()));
    if (match.bestMatch.rating < MATCH_FLOOR) return { car: null };
    return { car: needsArt[match.bestMatchIndex] };
}

function targetEmbed(target, imageURL, footer) {
    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        // "(rarity CR) Name" — the CR sits with the name so it's easy to check
        // against the number printed on the artwork.
        .setTitle(stagingCrName(target))
        .setDescription("Artwork wanted for this car.")
        .addFields(
            { name: "Brand", value: target.make.join(", ") || "—", inline: true },
            { name: "Year", value: String(target.modelYear), inline: true },
            { name: "Country", value: target.country || "—", inline: true }
        );
    if (imageURL) embed.setImage(imageURL);
    if (footer) embed.setFooter({ text: footer });
    return embed;
}

/**
 * @param {Message} message - the invoking message
 * @param {string[]} args - args AFTER "art" (i.e. the car name)
 */
async function runArtSubmission(message, args) {
    const fail = (title, desc) => new ErrorMessage({ channel: message.channel, title, desc, author: message.author }).sendMessage();

    // Optional extra gate on top of the channel. Left blank = channel access is
    // the only requirement; set artSubmitterRoleID in consts.js to tighten it.
    if (!(await hasRole(message, artSubmitterRoleID))) {
        return fail("Error, you can't submit artwork.",
            `Art submissions are limited to <@&${artSubmitterRoleID}>.`);
    }

    const query = args.join(" ").trim();
    if (!query) {
        return fail("Error, which car is it for?",
            "Example: `cd-submit art Ferrari Amalfi`\n\nSee what needs art with `cd-sub missing`.");
    }

    const { car: target, empty, ambiguous } = resolveTarget(query);
    if (empty) {
        return fail("Nothing needs artwork right now.", "Every staged car already has an image. Check back after the next update.");
    }
    if (ambiguous) {
        return fail(`"${query}" matches ${ambiguous.length} cars.`,
            ambiguous.slice(0, 10).map(car => `• ${car.name}`).join("\n") + "\n\nBe more specific.");
    }
    if (!target) {
        return fail(`No car awaiting art matches "${query}".`,
            "Run `cd-sub missing` to see the full list — it only covers cars that still need an image.");
    }

    const deadline = Date.now() + SESSION_BUDGET;
    const budget = perStage => Math.max(1, Math.min(perStage, deadline - Date.now()));

    // How many others are already in for this car? Useful context, not a limit.
    const rivals = await submissionModel.countDocuments({
        type: "art", targetKey: target.key, status: "pending"
    });

    await message.channel.send({
        content: `📷 **Post your artwork for this car now.** PNG, JPEG or WebP, at least 400px wide.`
            + (rivals > 0 ? `\n*${rivals} other submission${rivals === 1 ? "" : "s"} already in for this one — yours is judged alongside them.*` : ""),
        embeds: [targetEmbed(target, null)]
    });

    const collected = await message.channel.awaitMessages({
        filter: msg => msg.author.id === message.author.id && msg.attachments.size > 0,
        max: 1,
        time: budget(IMAGE_TIMEOUT)
    });
    const imageMessage = collected.first();
    if (!imageMessage) {
        return fail("Submission cancelled — no image arrived in time.", "Nothing was saved. Run the command again when you're ready.");
    }

    const attachment = imageMessage.attachments.first();
    const check = validateAttachment(attachment);
    if (!check.ok) {
        return fail("Submission cancelled — that image can't be used.", `${check.reason}\n\nNothing was saved.`);
    }

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("artConfirm").setLabel("Submit").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("artCancel").setLabel("Cancel").setEmoji("✖️").setStyle(ButtonStyle.Danger)
    );
    const preview = await message.channel.send({
        content: `<@${message.author.id}> — last look before this goes to the queue.`,
        embeds: [targetEmbed(target, attachment.url)],
        components: [confirmRow]
    });
    const decision = await preview.awaitMessageComponent({
        filter: click => click.user.id === message.author.id,
        time: budget(defaultChoiceTime)
    }).catch(() => null);

    await preview.edit({ components: [] }).catch(() => {});
    if (!decision || decision.customId === "artCancel") {
        return fail(decision ? "Submission cancelled." : "Submission timed out.", "Nothing was saved.");
    }
    await decision.deferUpdate().catch(() => {});

    try {
        const pending = await createSubmission({
            type: "art",
            creatorID: message.author.id,
            creatorTag: message.author.username,
            targetKey: target.key,
            targetName: target.name,
            targetFile: target.file,
            // Mirrored so the record reads sensibly on its own, and so search
            // over make/model works the same as it does for BM submissions.
            make: target.make,
            model: target.model,
            modelYear: target.modelYear,
            country: target.country
        });

        let archived;
        try {
            archived = await archiveSubmissionImage(
                attachment, pending.submissionID,
                `\`${pending.submissionID}\` — artwork for **${target.name}**`
            );
        }
        catch (archiveError) {
            await pending.deleteOne().catch(() => {});
            throw archiveError;
        }

        pending.imageArchiveChannelID = archived.channelID;
        pending.imageArchiveMessageID = archived.messageID;
        pending.imageLocalPath = archived.localPath;
        pending.imageWidth = archived.width;
        pending.imageHeight = archived.height;
        await pending.save();
        require("./submissionStore.js").mirrorToDisk(pending);

        return new SuccessMessage({
            channel: message.channel,
            title: `Submitted! Your ID is ${pending.submissionID}`,
            desc: `Artwork for **${target.name}** is in the queue.\n\n`
                + `Quote \`${pending.submissionID}\` if you need to ask about it, or `
                + `\`cd-sub image ${pending.submissionID}\` to swap the picture.`,
            author: message.author
        }).sendMessage();
    }
    catch (error) {
        console.log(`[Submissions] art submission failed for ${message.author.id}: ${error.stack}`);
        return fail("Error, your submission couldn't be saved.",
            `\`${error.message}\`\n\nNothing was filed — please try again, and tell an admin if it keeps happening.`);
    }
}

module.exports = { runArtSubmission, resolveTarget };
