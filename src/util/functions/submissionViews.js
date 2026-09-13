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
 *
 * Four submission types render here: BM cards ("bm"), artwork ("art"), whole
 * cars ("car") and suggested edits to live cars ("edit"). The feed — a read-only channel of submission events —
 * lives here too, because every status change that should post to it happens
 * in one of those two commands.
 */

const bot = require("../../config/config.js");
const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { compareTwoStrings } = require("string-similarity");
const { ErrorMessage } = require("../classes/classes.js");
const {
    adminRoleID, submissionsChannelID, submissionArchiveChannelID,
    submissionFeedChannelID, submissionFeedChannelIDDev
} = require("../consts/consts.js");
const { getCar } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");
const { crName, carCrName, stagingCrName, editCurrentValue } = require("./submissionDisplay.js");
const { getArchivedImageURL } = require("./submissionImage.js");
const { getStagingCar } = require("./stagingCars.js");
const { validateCarSubmission, describeReport } = require("./carSubmissionValidator.js");

const PER_PAGE = 10;
const STATUS_ICON = {
    draft: "📝",
    pending: "🕐",
    approved: "✅",
    rejected: "❌",
    changes: "✏️",
    withdrawn: "🚫",
    expired: "⌛"
};
const CAR_COLOUR = 0x3498db;

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

// ─── Car helpers ─────────────────────────────────────────────────────────────

/**
 * The validator takes RAW fields. A stored carData block is already canonical,
 * so feeding it straight back (minus the derived `cr`) re-validates it against
 * today's roster — which is how `set`, `submit` and the draft clock all check
 * a car without a second code path.
 */
function rawFieldsFrom(carData) {
    const fields = { ...(carData || {}) };
    delete fields.cr;
    return fields;
}

/** The top-level fields mirrored from carData so search and lists keep working. */
function mirrorFields(car) {
    return {
        make: car.make,
        model: car.model,
        modelYear: car.modelYear,
        country: car.country,
        description: car.description || ""
    };
}

/** Whole days until a draft is sent automatically (0 when overdue or not a draft). */
function daysLeft(submission) {
    if (!submission.draftDeadline) return 0;
    const deadline = DateTime.fromISO(submission.draftDeadline);
    if (!deadline.isValid) return 0;
    return Math.max(0, Math.ceil(deadline.diff(DateTime.utc(), "days").days));
}

const formatDate = iso => {
    const date = DateTime.fromISO(iso || "");
    return date.isValid ? date.toUTC().toFormat("d MMMM yyyy") : "?";
};

/** The stat block as a fixed-width table; two columns so it survives a phone. */
function carStatBlock(car) {
    const yn = value => value ? "yes" : "no";
    const rows = [
        ["Top speed", `${car.topSpeed} mph`, "0-60", `${car["0to60"]} s`],
        ["Handling", String(car.handling), "Weight", `${car.weight} kg`],
        ["Drive", car.driveType, "Tyres", car.tyreType],
        ["GC", car.gc, "Seats", String(car.seatCount)],
        ["Body", car.bodyStyle, "Engine", car.enginePos],
        ["Fuel", car.fuelType, "TCS / ABS", `${yn(car.tcs)} / ${yn(car.abs)}`],
        ["MRA", String(car.mra), "OLA", String(car.ola)]
    ];
    if (typeof car.power === "number") rows.push(["Power", `${car.power} PS`, "", ""]);
    return "```\n" + rows.map(row => `${row[0].padEnd(11)}${row[1].padEnd(13)}${row[2].padEnd(11)}${row[3]}`).join("\n") + "\n```";
}

function clampField(text, limit = 1024) {
    return text.length <= limit ? text : text.slice(0, limit - 1) + "…";
}

/**
 * The car card — one renderer for the creator's preview, the creator's
 * `view` and the reviewer's `view`, so all three read the same.
 *
 * @param {Object} submission  a submission document, or the preview's stand-in
 *                             ({ creatorTag, make, model, modelYear, country, carData })
 * @param {Object} [options]
 * @param {string} [options.imageURL]  image to show
 * @param {Object} [options.report]    validator report whose checks to list
 * @param {boolean} [options.preview]  no ID/status row, corrections included
 */
function buildCarEmbed(submission, options = {}) {
    const car = submission.carData || {};
    const icon = options.preview ? "" : `${STATUS_ICON[submission.status] || ""} `;
    const embed = new EmbedBuilder()
        .setColor(CAR_COLOUR)
        .setTitle(`${icon}🚗 ${carCrName(submission)}`);

    if (!options.preview) {
        embed.addFields(
            { name: "ID", value: `\`${submission.submissionID}\``, inline: true },
            { name: "Status", value: submission.status, inline: true },
            { name: "Creator", value: `<@${submission.creatorID}>`, inline: true }
        );
    }
    embed.addFields(
        { name: "Brand", value: (submission.make || []).join(", ") || "—", inline: true },
        { name: "Year", value: String(submission.modelYear || "—"), inline: true },
        { name: "Country", value: submission.country || "—", inline: true },
        { name: "Stats", value: carStatBlock(car) },
        { name: "Tags", value: (car.tags || []).length ? car.tags.join(", ") : "—" },
        { name: "Description", value: clampField(submission.description || car.description || "*(none)*") }
    );

    if (submission.crOverride > 0) {
        embed.addFields({ name: "CR", value: `**${submission.crOverride}** set by the reviewer — the formula says ${car.cr}` });
    }
    if (submission.hiddenTag && submission.hiddenTag.length) {
        embed.addFields({ name: "Hidden tags", value: submission.hiddenTag.join(", ") });
    }

    if (options.report) {
        const lines = describeReport(options.report)
            .filter(line => options.preview || !line.startsWith("✏️"));   // corrections only matter at paste time
        if (lines.length) embed.addFields({ name: "Checks", value: clampField(lines.join("\n")) });
    }

    if (submission.status === "draft") {
        const left = daysLeft(submission);
        embed.addFields({
            name: "📝 Draft",
            value: `Private until you send it. Goes to review automatically on **${formatDate(submission.draftDeadline)}**`
                + ` (${left} day${left === 1 ? "" : "s"} left)`
                + (submission.snoozeCount ? ` · snoozed ${submission.snoozeCount}×` : "")
        });
    }
    if (submission.autoSubmitted) {
        embed.addFields({ name: "⏰ Auto-sent", value: "Sent to review by the draft clock, not by the creator — expect no art and read it as unfinished." });
    }
    if (submission.reviewNote) embed.addFields({ name: "Review note", value: clampField(submission.reviewNote) });
    if (submission.generatedFile) embed.addFields({ name: "Staged file", value: `\`${submission.generatedFile}\`` });
    if (options.imageURL) embed.setImage(options.imageURL);
    return embed;
}

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
    if (submission.type === "edit") {
        const plus = (submission.supporters || []).length;
        return `${icon} \`${submission.submissionID}\` ✏️ **${submission.field}** on **${submission.targetName || submission.reference}** · ${who}${plus ? ` · +${plus}` : ""}`;
    }
    if (submission.type === "car") {
        let line = `${icon} \`${submission.submissionID}\` 🚗 **${carCrName(submission)}** · ${who}`;
        if (submission.status === "draft") {
            const left = daysLeft(submission);
            line += ` · *draft, ${left} day${left === 1 ? "" : "s"} left*`;
        }
        if (submission.autoSubmitted && submission.status === "pending") line += " ⏰";
        return line;
    }
    return `${icon} \`${submission.submissionID}\` **${crName(submission, submission.reference ? getCar(submission.reference) : null)}**`
        + (submission.collectionName ? ` · *${submission.collectionName}*` : "")
        + ` · ${who}`;
}

/** Display name for feed lines and DMs, whatever the type. */
function submissionName(submission) {
    if (submission.type === "edit") return `${submission.field} on ${submission.targetName || submission.reference}`;
    if (submission.type === "car") return carCrName(submission);
    if (submission.type === "art") return submission.targetName || "?";
    return crName(submission, submission.reference ? getCar(submission.reference) : null);
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

// ─── The feed ────────────────────────────────────────────────────────────────

const FEED_STYLE = {
    submitted: { colour: 0x9b59b6, icon: "🕐" },
    auto: { colour: 0x9b59b6, icon: "⏰" },
    art: { colour: 0x1abc9c, icon: "🎨" },
    resubmitted: { colour: 0x3498db, icon: "🔁" },
    changes: { colour: 0xfc7703, icon: "✏️" },
    approved: { colour: 0x03fc24, icon: "✅" },
    picked: { colour: 0xf1c40f, icon: "🏆" },
    rejected: { colour: 0xe74c3c, icon: "❌" },
    withdrawn: { colour: 0x95a5a6, icon: "🚫" },
    live: { colour: 0x2ecc71, icon: "🚗" },
    suggested: { colour: 0xe67e22, icon: "✏️" },
    attached: { colour: 0x3498db, icon: "👍" },
    expired: { colour: 0x95a5a6, icon: "⌛" }
};

function feedText(event, submission, extra) {
    const id = `\`${submission.submissionID}\``;
    const who = submission.creatorTag || `<@${submission.creatorID}>`;
    const name = `**${submissionName(submission)}**`;
    const reason = extra.reason ? `: ${clampField(String(extra.reason), 160)}` : "";
    switch (event) {
        case "submitted":
        case "auto":
            return `${id} ${name} · by ${who}`
                + (submission.type === "bm" ? ` · BM card${submission.reference ? ` based on \`${submission.reference}\`` : ""}` : "")
                + (event === "auto" ? " · sent automatically at the end of its draft period" : "");
        case "art": return `${id} artwork for ${name} · by ${who}`;
        case "resubmitted": return `${id} ${name} is back in the queue`;
        case "changes": return `${id} ${name} sent back for changes${reason}`;
        case "approved": return `${id} ${name} approved${extra.detail ? ` · ${extra.detail}` : ""}`;
        case "picked": return `${id} artwork picked for ${name} · by ${who}${extra.detail ? ` · ${extra.detail}` : ""}`;
        case "rejected": return `${id} ${name} rejected${reason}`;
        case "withdrawn": return `${id} ${name} withdrawn by its creator`;
        case "live": return `${id} ${name} is in the game as \`${extra.carID}\` · by ${who}`;
        case "suggested": return `${id} ${who} suggests a **${submission.field}** edit on **${submission.targetName || submission.reference}**: ${clampField(String(submission.proposedValue || ""), 120)}`;
        case "attached": return `${id} +1 from ${extra.who || "someone"} on the ${submission.field} edit for **${submission.targetName || submission.reference}**${extra.detail ? ` · ${extra.detail}` : ""}`;
        case "expired": return `${id} ${name} closed after ${extra.days || 30} days without a decision`;
        default: return `${id} ${event}`;
    }
}

/**
 * Post one line to the submissions feed. Fire-and-forget: never throws, never
 * pings, and a missing channel simply means no feed. The dev bot uses the
 * dev channel or stays silent, so testing never touches the real feed.
 *
 * @param {"submitted"|"auto"|"art"|"resubmitted"|"changes"|"approved"|"picked"|"rejected"|"withdrawn"|"live"|"suggested"|"attached"|"expired"} event
 * @param {Object} submission
 * @param {Object} [extra]  { reason, detail, carID }
 */
async function feed(event, submission, extra = {}) {
    try {
        const channelID = bot.devMode ? submissionFeedChannelIDDev : submissionFeedChannelID;
        if (!channelID || !bot.homeGuild || !submission) return;
        const channel = await bot.homeGuild.channels.fetch(channelID).catch(() => null);
        if (!channel) return;
        const style = FEED_STYLE[event] || { colour: 0x95a5a6, icon: "•" };
        const embed = new EmbedBuilder()
            .setColor(style.colour)
            .setDescription(`${style.icon} ${feedText(event, submission, extra)}`);
        if (submission.imageArchiveMessageID) {
            const url = await getArchivedImageURL(submission).catch(() => null);
            if (url) embed.setThumbnail(url);
        }
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        console.log(`[Submissions] feed post failed (${event}): ${error.message}`);
    }
}

// ─── Detail view ─────────────────────────────────────────────────────────────

/**
 * "Image source" field: the direct URL the embed uses plus the durable archive
 * message link and the local copy — so a broken embed image is still one
 * click away.
 */
/**
 * The durable link to a submission's archived image. A Discord message link
 * is a valid racehud value — the bot resolves it to a fresh image URL at
 * startup and every 12h — so this doubles as the hosting for a car that
 * arrived with its art. "" when there is no archived image.
 */
function archiveMessageLink(submission) {
    if (!submission || !submission.imageArchiveMessageID || !bot.homeGuild) return "";
    return `https://discord.com/channels/${bot.homeGuild.id}/${submission.imageArchiveChannelID || submissionArchiveChannelID}/${submission.imageArchiveMessageID}`;
}

function imageSourceField(submission, imageURL) {
    const bits = [];
    if (imageURL) bits.push(`[direct image](${imageURL})`);
    const link = archiveMessageLink(submission);
    if (link) bits.push(`[archive message](${link})`);
    if (submission.imageLocalPath) bits.push(`local copy \`${submission.imageLocalPath}\``);
    return bits.length ? { name: "Image source", value: bits.join(" · ") } : null;
}

/**
 * @param {Object} submission
 * @param {Object} [options]
 * @param {boolean} [options.forReviewer=false]  adds reviewer-only aids (the
 *        Pace Index the car would have if added) — not a tuning dashboard for
 *        the creator, so cd-sub view passes this only for admins.
 */
async function buildDetailEmbed(submission, options = {}) {
    // Suggested edits: what the car says now, what is proposed, who agrees.
    if (submission.type === "edit") {
        const car = submission.reference ? getCar(submission.reference) : null;
        const target = submission.targetName || submission.reference || "?";
        const embed = new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle(`${STATUS_ICON[submission.status] || ""} ✏️ ${submission.field} — ${target}`)
            .setDescription(`Suggested edit to \`${submission.reference}\`${car ? "" : " ⚠️ (that car no longer loads)"}`)
            .addFields(
                { name: "ID", value: `\`${submission.submissionID}\``, inline: true },
                { name: "Status", value: submission.status, inline: true },
                { name: "Suggested by", value: `<@${submission.creatorID}>`, inline: true },
                { name: "Currently", value: clampField(submission.currentValue || "—") },
                { name: "Proposed", value: clampField(submission.proposedValue || "—") }
            );
        if (submission.proposedRaw && submission.proposedRaw !== submission.proposedValue) {
            embed.addFields({ name: "As typed", value: clampField(submission.proposedRaw) });
        }
        if (submission.sourceUrl) embed.addFields({ name: "Source", value: clampField(submission.sourceUrl) });
        // The file may have moved on since the suggestion was made.
        const now = car ? editCurrentValue(car, submission.field) : null;
        if (now && now !== submission.currentValue && submission.field !== "other") {
            embed.addFields({ name: "Now in the file", value: clampField(now) });
        }
        const supporters = submission.supporters || [];
        if (supporters.length) {
            embed.addFields({
                name: `+${supporters.length} agree`,
                value: clampField(supporters.map(entry => `<@${entry.userID}>${entry.note ? ` — ${String(entry.note).slice(0, 100)}` : ""}${entry.source ? ` (${String(entry.source).slice(0, 60)})` : ""}`).join("\n"))
            });
        }
        if (submission.reviewNote) embed.addFields({ name: "Review note", value: clampField(submission.reviewNote) });
        if (submission.appliedAt) {
            embed.addFields({ name: "Applied", value: `**${submission.appliedValue || submission.proposedValue}** by <@${submission.appliedBy}> on ${formatDate(submission.appliedAt)}` });
        }
        if (options.forReviewer && submission.status === "pending") {
            const how = submission.field === "power"
                ? "writes it into the carfile and reloads the car"
                : submission.field === "description"
                    ? "marks it accepted — add `apply` to write the text into the carfile"
                    : "marks it accepted; make the change by hand";
            embed.addFields({ name: "Review", value: `\`cd-review approve ${submission.submissionID}\` — ${how}\n\`cd-review reject ${submission.submissionID} <reason>\`` });
        }
        return embed;
    }

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

    // Whole cars: the stat card, re-checked against TODAY'S roster so the
    // warnings (odd stats, "already in the game") are always current.
    if (submission.type === "car") {
        const report = submission.carData
            ? validateCarSubmission(rawFieldsFrom(submission.carData), { isAdmin: true })
            : null;
        const imageURL = await getArchivedImageURL(submission);
        const embed = buildCarEmbed(submission, { imageURL, report });
        if (options.forReviewer) {
            const pace = paceIfAdded(submission);
            if (pace) embed.addFields(pace);
        }
        if (submission.status === "approved" && !submission.finalCarID && !submission.racehud) {
            embed.addFields({ name: "⚠️ Still needed", value: "The final art URL — attach it with `cd-review sethud`." });
        }
        const source = imageSourceField(submission, imageURL);
        if (source) embed.addFields(source);
        if (!imageURL && submission.imageLocalPath) embed.addFields({ name: "Image", value: "Archive unreachable — see the local copy above." });
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

/**
 * "Pace Index if added" — where the car would land on the live field today
 * (docs/pace-index.md), the one thing a stat sheet can't tell a reviewer. The
 * headline is the peak (best-ten) PI with the all-tracks average beside it,
 * then how it compares with live cars of the same CR, then its crowns and
 * best tracks. Only shown on the detail view, never the creator's preview.
 */
function paceIfAdded(submission) {
    if (!submission.carData) return null;
    let rating;
    try {
        const { rateOutsider } = require("./paceIndex.js");
        const cr = submission.crOverride > 0 ? submission.crOverride : submission.carData.cr;
        rating = rateOutsider({ ...submission.carData, cr });
    }
    catch (error) {
        return null;
    }
    if (!rating) return null;

    const lines = [`**${rating.pi}** (avg ${rating.average}) against ${rating.field.toLocaleString()} live cars`];
    if (rating.bracket) {
        const sign = rating.vsCR > 0 ? "+" : "";
        let verdict = "";
        if (rating.vsCR >= 1500) verdict = " ⚠️ far above its price";
        else if (rating.vsCR <= -1500) verdict = " ⚠️ dead weight at this price";
        lines.push(`Cars within ±25 CR of ${rating.bracket.cr} average **${rating.bracket.avgPI}** → ${sign}${rating.vsCR}${verdict}`);
    }
    if (rating.crowns > 0) {
        const shown = rating.crownTracks.slice(0, 4).join(", ");
        lines.push(`👑 #1 on **${rating.crowns}** track${rating.crowns === 1 ? "" : "s"}: ${shown}${rating.crowns > 4 ? ", …" : ""}`);
    }
    if (rating.topTracks.length) {
        lines.push("Best: " + rating.topTracks.map(t => `${t.trackName} (#${t.rank}${t.rank > 1 ? `, ${t.gap} behind` : ""})`).join(" · "));
    }
    return { name: "Pace Index if added", value: clampField(lines.join("\n")) };
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
    submissionName,
    notifyCreator,
    feed,
    buildDetailEmbed,
    buildCarEmbed,
    archiveMessageLink,
    rawFieldsFrom,
    mirrorFields,
    daysLeft,
    formatDate,
    paginate
};
