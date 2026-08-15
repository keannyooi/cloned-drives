"use strict";

/**
 * SUBMISSION IMAGE ARCHIVE
 * ========================
 * Discord attachment URLs are signed and expire (roughly 24 hours), and the
 * submitter can delete their message at any time — so the URL a creator posts
 * is worthless as a record.
 *
 * Instead the bot downloads the bytes once and keeps TWO durable copies:
 *   1. a message in the private archive channel (re-fetch it for a fresh URL)
 *   2. a file in src/submissions/images/ (survives Discord entirely)
 *
 * Only the archive message ID is stored on the submission. Nothing ever stores
 * a URL.
 */

const bot = require("../../config/config.js");
const { AttachmentBuilder } = require("discord.js");
const { writeFileSync } = require("fs");
const path = require("path");
const { submissionArchiveChannelID } = require("../consts/consts.js");
const { IMAGES_DIR, ensureDirs } = require("./submissionStore.js");

// Card art that comes in under this is almost certainly a thumbnail or a
// screenshot of a screenshot — worth rejecting at the door.
const MIN_WIDTH = 400;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/**
 * Check an attachment before doing any work with it.
 * @returns {{ok: boolean, reason?: string}}
 */
function validateAttachment(attachment) {
    if (!attachment) return { ok: false, reason: "No image was attached." };
    const type = (attachment.contentType || "").split(";")[0].toLowerCase();
    if (!ALLOWED.includes(type)) {
        return { ok: false, reason: `That's not an image I can use (got \`${type || "unknown"}\`). PNG, JPEG or WebP please.` };
    }
    if (attachment.size > MAX_BYTES) {
        return { ok: false, reason: `That image is ${(attachment.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_BYTES / 1024 / 1024}MB.` };
    }
    if (attachment.width && attachment.width < MIN_WIDTH) {
        return { ok: false, reason: `That image is only ${attachment.width}px wide — ${MIN_WIDTH}px is the minimum for card art.` };
    }
    return { ok: true };
}

const extensionFor = attachment => {
    const type = (attachment.contentType || "").split(";")[0].toLowerCase();
    if (type === "image/jpeg") return "jpg";
    if (type === "image/webp") return "webp";
    return "png";
};

/**
 * Download an attachment and archive it in both places.
 *
 * @param {Attachment} attachment - the submitter's uploaded image
 * @param {string} submissionID - "SBM000001"
 * @param {string} label - human-readable card name for the archive post
 * @returns {Promise<{channelID, messageID, localPath, width, height}>}
 * @throws if the download or the archive post fails — the caller must not
 *   record a submission whose image was never captured.
 */
async function archiveSubmissionImage(attachment, submissionID, label) {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`image download failed (HTTP ${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());

    // (1) local copy first — it's the one that doesn't depend on Discord
    ensureDirs();
    const filename = `${submissionID}.${extensionFor(attachment)}`;
    const localPath = path.join(IMAGES_DIR, filename);
    writeFileSync(localPath, buffer);

    // (2) archive channel
    if (!submissionArchiveChannelID) {
        throw new Error("submissionArchiveChannelID is not set in consts.js");
    }
    const channel = await bot.homeGuild.channels.fetch(submissionArchiveChannelID).catch(() => null);
    if (!channel) throw new Error(`archive channel ${submissionArchiveChannelID} not found`);

    const posted = await channel.send({
        content: `\`${submissionID}\` — ${label}`,
        files: [new AttachmentBuilder(buffer, { name: filename })]
    });

    return {
        channelID: channel.id,
        messageID: posted.id,
        localPath: path.relative(path.join(__dirname, "../../.."), localPath).replace(/\\/g, "/"),
        width: attachment.width || 0,
        height: attachment.height || 0
    };
}

/**
 * Current, non-expired URL for an archived image. Re-fetches the archive
 * message every time — never trust a cached URL.
 * @returns {Promise<string|null>}
 */
async function getArchivedImageURL(submission) {
    if (!submission || !submission.imageArchiveMessageID) return null;
    const channel = await bot.homeGuild.channels
        .fetch(submission.imageArchiveChannelID || submissionArchiveChannelID)
        .catch(() => null);
    if (!channel) return null;
    const message = await channel.messages.fetch(submission.imageArchiveMessageID).catch(() => null);
    if (!message) return null;
    const attachment = message.attachments.first();
    return attachment ? attachment.url : null;
}

module.exports = { validateAttachment, archiveSubmissionImage, getArchivedImageURL };
