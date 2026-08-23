"use strict";

/**
 * DISCORD MESSAGE-LINK IMAGES  (temporary art host)
 * =================================================
 * File Garden stopped accepting uploads, so new art can be posted to a Discord
 * channel instead and referenced by its MESSAGE LINK:
 *
 *   "racehud": "https://discord.com/channels/<guild>/<channel>/<message>"
 *
 * Why the message link and not the image link: Discord attachment URLs are
 * signed (`?ex=…&is=…&hm=…`) and expire in ~24h — three such URLs already sit
 * dead in this repo's archived data. The ATTACHMENT never expires, only the
 * signed URL, so re-fetching the message yields a fresh one.
 *
 * How this is wired in without touching 55 call sites:
 *   `racehud` and friends are read SYNCHRONOUSLY in ~30 files and handed
 *   straight to Discord. Rather than make all of those async, the link is
 *   resolved ONCE and the fresh URL is written onto the in-memory object, so
 *   every existing consumer keeps working unchanged. The JSON on disk is never
 *   written by the bot (verified), so the durable message link is preserved and
 *   only the RAM copy holds the volatile URL.
 *
 * Refreshed on startup and every REFRESH_HOURS after, comfortably inside the
 * ~24h expiry.
 *
 * Caveats worth knowing:
 *   • An embed already posted keeps its old URL, so scrollback decays after a day.
 *   • Delete the archive message and the art is gone permanently — lock the channel.
 *   • One API call per link per refresh: fine for a handful, not for a library.
 */

const bot = require("../../config/config.js");
const {
    getCar, getTrack, getPack, getDriver,
    getCarFiles, getTrackFiles, getPackFiles, getDriverFiles
} = require("./dataManager.js");

// https://discord.com/channels/<guild>/<channel>/<message>  (also discordapp.com)
const MESSAGE_LINK = /^https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)\/?$/;

const REFRESH_HOURS = 12;

// Every image-bearing field, by data type. `id` is the 6-char file ID.
const TARGETS = [
    { type: "car",    fields: ["racehud"],           list: getCarFiles,    get: getCar },
    { type: "track",  fields: ["background", "map"], list: getTrackFiles,  get: getTrack },
    { type: "pack",   fields: ["pack"],              list: getPackFiles,   get: getPack },
    { type: "driver", fields: ["image"],             list: getDriverFiles, get: getDriver }
];

// `${type}:${id}:${field}` -> the ORIGINAL message link. Kept separately because
// once resolved the field holds a signed URL, so a re-scan would no longer see
// the link. Survives dataManager reloads: objects are looked up fresh each pass.
const sources = new Map();
let lastRun = null;

function isMessageLink(value) {
    return typeof value === "string" && MESSAGE_LINK.test(value.trim());
}

function parseMessageLink(value) {
    const match = typeof value === "string" && value.trim().match(MESSAGE_LINK);
    if (!match) return null;
    return { guildID: match[1], channelID: match[2], messageID: match[3] };
}

/** Current, non-expired attachment URL behind a message link (null if unreachable). */
async function resolveMessageLink(link) {
    const ids = parseMessageLink(link);
    if (!ids) return null;
    const channel = await bot.channels.fetch(ids.channelID).catch(() => null);
    if (!channel || typeof channel.messages !== "object") return null;
    const message = await channel.messages.fetch(ids.messageID).catch(() => null);
    if (!message) return null;
    const attachment = message.attachments.first();
    return attachment ? attachment.url : null;
}

/** Record any message links currently sitting in the loaded data. */
function scan() {
    for (const target of TARGETS) {
        let files;
        try { files = target.list() || []; } catch (error) { continue; }
        for (const file of files) {
            const id = String(file).slice(0, 6);
            const obj = target.get(id);
            if (!obj) continue;
            for (const field of target.fields) {
                if (!isMessageLink(obj[field])) continue;
                sources.set(`${target.type}:${id}:${field}`, {
                    type: target.type, id, field, link: obj[field].trim(), get: target.get
                });
            }
        }
    }
    return sources.size;
}

/**
 * Re-scan for new links, then resolve every known one and write the fresh URL
 * onto the in-memory object. Safe to call repeatedly.
 */
async function refreshImageLinks({ quiet = false } = {}) {
    scan();
    let ok = 0, failed = 0;
    const failures = [];
    for (const entry of sources.values()) {
        const obj = entry.get(entry.id);
        if (!obj) continue;
        const url = await resolveMessageLink(entry.link);
        if (url) {
            obj[entry.field] = url;
            ok++;
        }
        else {
            failed++;
            failures.push(`${entry.type} ${entry.id}.${entry.field}`);
            // Leave whatever is there: a previously resolved URL may still work,
            // and an unresolved link is at least a breadcrumb to the message.
        }
    }
    lastRun = new Date();
    if (!quiet && (ok > 0 || failed > 0)) {
        console.log(`[art] Discord-hosted images refreshed: ${ok} ok${failed ? `, ${failed} FAILED (${failures.slice(0, 5).join(", ")})` : ""}`);
    }
    return { ok, failed, failures, tracked: sources.size, lastRun };
}

/** Start the refresh loop. Call once, after the gateway is ready. */
function startImageLinkRefresh() {
    const tick = () => refreshImageLinks().catch(error => console.log(`[art] refresh failed: ${error.message}`));
    tick();
    setInterval(tick, REFRESH_HOURS * 60 * 60 * 1000);
}

module.exports = {
    isMessageLink, parseMessageLink, resolveMessageLink,
    refreshImageLinks, startImageLinkRefresh,
    REFRESH_HOURS,
    _sources: sources
};
