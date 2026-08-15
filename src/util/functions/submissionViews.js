"use strict";

/**
 * SUBMISSION VIEWS
 * ================
 * Rendering, search and notification shared by the two submission commands:
 *
 *   cd-sub     creators — their own work, and browsing what's open
 *   cd-review  admins   — the queue and the decisions
 *
 * They were one command with eighteen subcommands, which made both audiences
 * wade through the other's. Splitting them meant this had to live somewhere
 * both could reach, so there is still exactly one implementation of each view.
 */

const bot = require("../../config/config.js");
const { EmbedBuilder } = require("discord.js");
const { compareTwoStrings } = require("string-similarity");
const { ErrorMessage } = require("../classes/classes.js");
const { adminRoleID, submissionsChannelID } = require("../consts/consts.js");
const { getCar } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const { crName, stagingCrName } = require("./submissionDisplay.js");
const { getArchivedImageURL } = require("./submissionImage.js");
const { getStagingCar } = require("./stagingCars.js");

const PER_PAGE = 10;
const STATUS_ICON = {
    pending: "🕐",
    approved: "✅",
    rejected: "❌",
    changes: "✏️",
    withdrawn: "🚫"
};

/**
 * Role checks that work in a DM.
 *
 * `message.member` is null outside a guild, so any check against it silently
 * denies everyone in DMs — and submissions are DM-first by design. These
 * resolve the member from the home guild instead, the same way
 * processCommand() in index.js already does.
 */
async function memberOf(message) {
    if (message.member) return message.member;
    if (!bot.homeGuild) return null;
    return bot.homeGuild.members.cache.get(message.author.id)
        || await bot.homeGuild.members.fetch(message.author.id).catch(() => null);
}

async function hasRole(message, roleID) {
    if (!roleID) return false;
    const member = await memberOf(message);
    return !!member && member.roles.cache.has(roleID);
}

const isAdmin = message => hasRole(message, adminRoleID);
const fail = (message, title, desc) => new ErrorMessage({ channel: message.channel, title, desc, author: message.author }).sendMessage();

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Everything about a submission worth matching a search against — one
 * lowercase blob so "porsche 911" hits regardless of which field each word
 * came from.
 */
const haystack = submission => [
    submission.submissionID,
    ...(submission.make || []),
    submission.model,
    submission.referenceName,
    submission.targetName,
    submission.collectionName,
    submission.creatorTag
].filter(Boolean).join(" ").toLowerCase();

/** The card's OWN name — what a query is usually really aiming at. */
const primaryOf = submission => [...(submission.make || []), submission.model]
    .filter(Boolean).join(" ").toLowerCase();

/**
 * Rank submissions against free text. Every word must appear somewhere, so
 * "porsche 911" never returns every Porsche.
 *
 * Ranking is by WHERE the match landed, not raw similarity — a card literally
 * called "Porsche 911 …" must beat one that merely references a Porsche 911.
 * Similarity alone gets this backwards, because the Dice coefficient favours
 * whichever record happens to have less text in it.
 */
function searchSubmissions(all, query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const words = needle.split(/\s+/);

    return all
        .map(submission => {
            const hay = haystack(submission);
            if (!words.every(word => hay.includes(word))) return null;

            if (submission.submissionID.toLowerCase() === needle) {
                return { submission, score: 100 };          // an ID hit is unambiguous
            }
            const primary = primaryOf(submission);
            let score;
            if (primary.includes(needle)) score = 10;        // whole phrase in the card's name
            else if (words.every(word => primary.includes(word))) score = 6;
            else score = 1;                                  // matched via reference/collection/creator only

            // Similarity is a TIEBREAK within a band, never across bands.
            return { submission, score: score + compareTwoStrings(needle, primary) };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.submission);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/** One-line summary used by every list view. */
function summarise(submission) {
    const icon = STATUS_ICON[submission.status] || "•";
    const who = submission.creatorTag || submission.creatorID;
    if (submission.type === "art") {
        const staged = getStagingCar(submission.targetKey);
        const name = staged ? stagingCrName(staged) : submission.targetName || "?";
        return `${icon} \`${submission.submissionID}\` 🎨 **${name}** · ${who}`;
    }
    return `${icon} \`${submission.submissionID}\` **${crName(submission, submission.reference ? getCar(submission.reference) : null)}**`
        + (submission.collectionName ? ` · *${submission.collectionName}*` : "")
        + ` · ${who}`;
}

/**
 * Tell the submitter what happened. DMs are frequently closed, so a failed DM
 * falls back to a ping in the submissions channel rather than going unheard.
 * @returns {Promise<"dm"|"channel"|"nobody">}
 */
async function notifyCreator(submission, title, body) {
    const embed = new EmbedBuilder()
        .setColor(submission.status === "approved" ? 0x03fc24 : 0xfc7703)
        .setTitle(title)
        .setDescription(body)
        .setFooter({ text: submission.submissionID });

    const user = await bot.users.fetch(submission.creatorID).catch(() => null);
    if (user) {
        const sent = await user.send({ embeds: [embed] }).catch(() => null);
        if (sent) return "dm";
    }
    if (submissionsChannelID) {
        const channel = await bot.homeGuild.channels.fetch(submissionsChannelID).catch(() => null);
        if (channel) {
            await channel.send({ content: `<@${submission.creatorID}>`, embeds: [embed] }).catch(() => {});
            return "channel";
        }
    }
    return "nobody";
}

/** Full card view, with a freshly-fetched archive image. */
async function buildDetailEmbed(submission) {
    // Art submissions have no reference car and no card metadata of their own —
    // they're a picture proposed for a car that already exists in staging.
    if (submission.type === "art") {
        const staged = getStagingCar(submission.targetKey);
        // Once the car has art it drops out of staging, so fall back to the
        // name captured at submission time rather than showing "?".
        const heading = staged ? stagingCrName(staged) : submission.targetName || "?";
        const embed = new EmbedBuilder()
            .setColor(staged ? 0x1abc9c : 0x95a5a6)
            .setTitle(`${STATUS_ICON[submission.status] || ""} 🎨 ${heading}`)
            .setDescription("Artwork submission")
            .addFields(
                { name: "ID", value: `\`${submission.submissionID}\``, inline: true },
                { name: "Status", value: submission.status, inline: true },
                { name: "Creator", value: `<@${submission.creatorID}>`, inline: true },
                { name: "Carfile", value: `\`${submission.targetFile || "?"}\`` }
            );
        if (!staged) {
            embed.addFields({
                name: "⚠️ No longer needed",
                value: "That car already has artwork — either another submission was picked, or the carfile was updated."
            });
        }
        if (submission.reviewNote) embed.addFields({ name: "Review note", value: submission.reviewNote });
        const artURL = await getArchivedImageURL(submission);
        if (artURL) embed.setImage(artURL);
        else if (submission.imageLocalPath) embed.addFields({ name: "Image", value: `Archive unreachable — local copy at \`${submission.imageLocalPath}\`` });
        return embed;
    }

    const reference = submission.reference ? getCar(submission.reference) : null;
    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        // Same shape cd-carinfo uses (carinfo.js:77 → carNameGen with
        // rarity:true): "(<rarity> <CR>) Make Model". A BM card inherits its CR
        // from the reference car, so this is the number that should be printed
        // on the art — a mismatch is visible at a glance.
        .setTitle(`${STATUS_ICON[submission.status] || ""} ${crName(submission, reference)}`)
        .addFields(
            { name: "ID", value: `\`${submission.submissionID}\``, inline: true },
            { name: "Status", value: submission.status, inline: true },
            { name: "Creator", value: `<@${submission.creatorID}>`, inline: true },
            {
                name: "Based on",
                value: reference
                    ? `\`${submission.reference}\` — ${carNameGen({ currentCar: reference, removePrizeTag: true })}`
                    : `⚠️ not in the game: "${submission.referenceName || "?"}"`
            },
            { name: "Brand", value: (submission.make || []).join(", ") || "—", inline: true },
            { name: "Year", value: String(submission.modelYear || "—"), inline: true },
            { name: "Country", value: submission.country || "—", inline: true }
        );
    if (submission.collectionName) embed.addFields({ name: "Collection", value: submission.collectionName });
    // Description at the bottom, closest to the art it describes.
    embed.addFields({ name: "Description", value: submission.description || "*(none)*" });
    if (submission.reviewNote) embed.addFields({ name: "Review note", value: submission.reviewNote });
    if (submission.generatedFile) embed.addFields({ name: "Staged file", value: `\`${submission.generatedFile}\`` });
    if (submission.status === "approved" && !submission.finalCarID) {
        embed.addFields({ name: "⚠️ Still needed", value: "The final art URL — attach it with `cd-review sethud`." });
    }

    const imageURL = await getArchivedImageURL(submission);
    if (imageURL) embed.setImage(imageURL);
    else if (submission.imageLocalPath) embed.addFields({ name: "Image", value: `Archive unreachable — local copy at \`${submission.imageLocalPath}\`` });

    return embed;
}

/** Shared pagination maths for the list views. */
function paginate(list, pageArg) {
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const page = Math.min(Math.max(parseInt(pageArg) || 1, 1), totalPages);
    return { page, totalPages, slice: list.slice((page - 1) * PER_PAGE, page * PER_PAGE) };
}

module.exports = {
    PER_PAGE,
    STATUS_ICON,
    memberOf,
    hasRole,
    isAdmin,
    fail,
    searchSubmissions,
    summarise,
    notifyCreator,
    buildDetailEmbed,
    paginate
};
