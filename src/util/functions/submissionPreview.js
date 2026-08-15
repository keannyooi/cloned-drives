"use strict";

/**
 * SUBMISSION PREVIEW
 * ==================
 * Renders a staged car the way cd-carinfo renders a live one, with each
 * candidate artwork swapped into the image slot.
 *
 * The point is comparison: four people submit art for the same car, and the
 * only way to judge them is to see each one *on the card*, with the same stats
 * around it — not as four loose images in a queue.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { stagingCrName } = require("./submissionDisplay.js");
const { getArchivedImageURL } = require("./submissionImage.js");

/** Fields mirroring cd-carinfo's layout, read off the staged carfile. */
function statFields(car) {
    const val = v => (v === undefined || v === null || v === "" ? "—" : String(v));
    const fields = [
        { name: "Top Speed", value: `${val(car.topSpeed)}MPH`, inline: true },
        { name: "0-60MPH", value: val(car["0to60"]), inline: true },
        { name: "Handling", value: val(car.handling), inline: true },
        { name: "Drive Type", value: val(car.driveType), inline: true },
        { name: "Tyre Type", value: val(car.tyreType), inline: true },
        { name: "Weight", value: car.weight ? `${car.weight.toLocaleString("en-US")}kg` : "—", inline: true },
        { name: "Ground Clearance", value: val(car.gc), inline: true },
        { name: "Seat Count", value: val(car.seatCount), inline: true },
        { name: "Body Style", value: val(car.bodyStyle), inline: true },
        { name: "Engine Position", value: val(car.enginePos), inline: true },
        { name: "Fuel Type", value: val(car.fuelType), inline: true },
        { name: "Country", value: val(car.country), inline: true },
        { name: "MRA", value: val(car.mra), inline: true },
        { name: "OLA", value: val(car.ola), inline: true },
        { name: "Creator", value: val(car.creator), inline: true }
    ];
    if (Array.isArray(car.tags) && car.tags.length > 0) {
        fields.push({ name: "Tags", value: car.tags.join(", ") });
    }
    return fields;
}

/**
 * One page of the preview.
 * @param {Object} staged - entry from stagingCars (carries `raw`)
 * @param {Object|null} submission - the candidate being shown, or null when none
 * @param {number} index - 0-based position
 * @param {number} total - how many candidates
 * @param {string|null} imageURL - freshly fetched archive URL
 */
function previewEmbed(staged, submission, index, total, imageURL) {
    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle(stagingCrName(staged))
        .setDescription(`Car ID: \`${staged.key}\`` + (staged.raw.description ? `\n${staged.raw.description}` : ""))
        .addFields(statFields(staged.raw));

    if (submission) {
        embed.setFooter({
            text: `Artwork ${index + 1} of ${total} · ${submission.submissionID} by ${submission.creatorTag || submission.creatorID}`
        });
        if (imageURL) embed.setImage(imageURL);
    }
    else {
        embed.setFooter({ text: "No artwork submitted yet" });
    }
    return embed;
}

/**
 * Navigation + the decision. Disabled arrows when there's only one candidate,
 * so the row still renders but can't mislead.
 */
function previewButtons(total, hasCandidate) {
    const solo = total <= 1;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prevArt").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(solo),
        new ButtonBuilder().setCustomId("nextArt").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(solo),
        new ButtonBuilder().setCustomId("pickArt").setLabel("Pick this one").setEmoji("✅")
            .setStyle(ButtonStyle.Success).setDisabled(!hasCandidate)
    );
}

/**
 * Resolve every archived image URL up front. They're signed and short-lived,
 * so they're fetched per preview session rather than cached anywhere.
 */
async function loadCandidateImages(submissions) {
    return Promise.all(submissions.map(entry => getArchivedImageURL(entry).catch(() => null)));
}

module.exports = { previewEmbed, previewButtons, loadCandidateImages, statFields };
