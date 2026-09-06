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
const { adminRoleID, submissionsChannelID, submissionArchiveChannelID } = require("../consts/consts.js");
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
    // Accepts a single role ID or an array of them (any match passes).
    const wanted = (Array.isArray(roleID) ? roleID : [roleID]).filter(Boolean);
    if (wanted.length === 0) return false;
    const member = await memberOf(message);
    return !!member && wanted.some(id => member.roles.cache.has(id));
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

/**
 * "Image source" field: the direct URL the embed uses plus the durable archive
 * message link and the local copy — so a broken embed image is still one
 * click away.
 */
function imageSourceField(submission, imageURL) {
    const bits = [];
    if (imageURL) bits.push(`[direct image](${imageURL})`);
    if (submission.imageArchiveMessageID && bot.homeGuild) {
        bits.push(`[archive message](https://discord.com/channels/${bot.homeGuild.id}/${submission.imageArchiveChannelID || submissionArchiveChannelID}/${submission.imageArchiveMessageID})`);
    }
    if (submission.imageLocalPath) bits.push(`local copy \`${submission.imageLocalPath}\``);
    return bits.length ? { name: "Image source", value: bits.join(" · ") } : null;
}

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
        const artSource = imageSourceField(submission, artURL);
        if (artSource) embed.addFields(artSource);
        if (!artURL && submission.imageLocalPath) embed.addFields({ name: "Image", value: "Archive unreachable — see the local copy above." });
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
            // Year/country are pre-filled from the reference; flag it when the
            // creator changed them so a typo (or a deliberate variant) is obvious.
            { name: "Year", value: flagChanged(submission.modelYear, reference && reference.modelYear), inline: true },
            { name: "Country", value: flagChanged(submission.country, reference && reference.country), inline: true },
            { name: "Collection", value: submission.collectionName || "None", inline: true }
        );
    // Description at the bottom, closest to the art it describes.
    embed.addFields({ name: "Description", value: submission.description || "*(none)*" });
    if (submission.reviewNote) embed.addFields({ name: "Review note", value: submission.reviewNote });
    if (submission.generatedFile) embed.addFields({ name: "Staged file", value: `\`${submission.generatedFile}\`` });
    if (submission.status === "approved" && !submission.finalCarID) {
        embed.addFields({ name: "⚠️ Still needed", value: "The final art URL — attach it with `cd-review sethud`." });
    }

    const imageURL = await getArchivedImageURL(submission);
    if (imageURL) embed.setImage(imageURL);
    const source = imageSourceField(submission, imageURL);
    if (source) embed.addFields(source);
    if (!imageURL && submission.imageLocalPath) embed.addFields({ name: "Image", value: "Archive unreachable — see the local copy above." });

    return embed;
}

/** "2024" or "2024 ⚠️ changed (ref 2019)" — a value beside what the reference car says. */
function flagChanged(mine, ref) {
    const shown = mine === undefined || mine === null || mine === "" ? "—" : String(mine);
    if (ref === undefined || ref === null || ref === "" || shown === "—") return shown;
    return String(mine) === String(ref) ? shown : `${shown} ⚠️ changed (ref ${ref})`;
}

/**
 * Sort comparator for submission IDs. A Mongo .sort({ submissionID: 1 }) is
 * LEXICOGRAPHIC, which orders SAW1, SAW10, SAW11, SAW2 — the number inside the
 * ID is what "oldest first" actually means, since IDs mint sequentially.
 * SBM and SAW interleave by number; same-number ties break on the prefix.
 */
function bySubmissionNumber(a, b) {
    const numberOf = id => parseInt(String(id).replace(/\D/g, ""), 10) || 0;
    return numberOf(a.submissionID) - numberOf(b.submissionID)
        || String(a.submissionID).localeCompare(String(b.submissionID));
}

/** Shared pagination maths for the list views. */
function paginate(list, pageArg) {
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const page = Math.min(Math.max(parseInt(pageArg) || 1, 1), totalPages);
    return { page, totalPages, slice: list.slice((page - 1) * PER_PAGE, page * PER_PAGE) };
}

module.exports = {
    PER_PAGE,
    bySubmissionNumber,
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
