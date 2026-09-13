"use strict";

/**
 * CARFILE PATCH
 * =============
 * Field-level edits to src/cars/cXXXXX.json that leave every other byte of
 * the file alone. The files are hand-formatted (four-space indent, arrays
 * inline with no space after the comma, keys in a house order), and 8,000 of
 * them are tracked in git — so re-serialising a whole file to change one
 * number would bury the real change in formatting noise. This module edits
 * the text: it finds `"key": <value>`, replaces the value in place, inserts a
 * missing key after a chosen neighbour, or removes an entry, and checks that
 * the result still parses before anything is written.
 *
 *   const { patchCarfile } = require("./carfilePatch.js");
 *   patchCarfile("c00436", { set: { power: 456 }, remove: ["powerEstimated"], log: { … } });
 *
 * Used by the power backfill (scripts/estimatePowerAll.js) and by approving a
 * suggested edit (cd-review approve SEDx).
 */

const { readFileSync, writeFileSync, existsSync } = require("fs");
const path = require("path");

const CARS_DIR = path.join(__dirname, "../../cars");

// Where a new key goes: after the first of these neighbours that exists.
// Anything not listed is appended as the last entry.
const INSERT_AFTER = {
    power: ["ola", "mra", "fuelType", "enginePos"],
    powerEstimated: ["power"],
    editLog: ["hiddenTag", "creator", "racehud"]
};

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Serialise the way src/cars/ is written: arrays inline, no space after the comma. */
function serialise(value) {
    if (Array.isArray(value)) return "[" + value.map(item => JSON.stringify(item)).join(",") + "]";
    return JSON.stringify(value);
}

/** Index just past the JSON value that starts at `start`. Throws on malformed text. */
function scanValue(text, start) {
    const first = text[start];
    if (first === "\"") {
        for (let i = start + 1; i < text.length; i++) {
            if (text[i] === "\\") { i++; continue; }
            if (text[i] === "\"") return i + 1;
        }
        throw new Error("unterminated string");
    }
    if (first === "[" || first === "{") {
        let depth = 0, inString = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (ch === "\\") i++;
                else if (ch === "\"") inString = false;
                continue;
            }
            if (ch === "\"") inString = true;
            else if (ch === "[" || ch === "{") depth++;
            else if (ch === "]" || ch === "}") { depth--; if (depth === 0) return i + 1; }
        }
        throw new Error("unterminated array or object");
    }
    const match = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(start));
    if (!match) throw new Error(`no JSON value at offset ${start}`);
    return start + match[0].length;
}

/** Locate a top-level `"key": value` entry. Null when the key is absent. */
function findEntry(text, key) {
    const re = new RegExp(`^([ \\t]*)"${escapeRegExp(key)}"[ \\t]*:[ \\t]*`, "m");
    const match = re.exec(text);
    if (!match) return null;
    const valueStart = match.index + match[0].length;
    return { start: match.index, indent: match[1], valueStart, valueEnd: scanValue(text, valueStart) };
}

/** The file's line ending, from its first line break. */
const lineEnding = text => (text.includes("\r\n") ? "\r\n" : "\n");

/** Replace the value of an existing key, or insert the key after its neighbour. */
function setKey(text, key, value, after = INSERT_AFTER[key] || []) {
    const entry = findEntry(text, key);
    if (entry) return text.slice(0, entry.valueStart) + serialise(value) + text.slice(entry.valueEnd);

    const eol = lineEnding(text);
    // The neighbour to sit behind: the first listed one present, else the last entry in the file.
    let anchor = null;
    for (const neighbour of after) { anchor = findEntry(text, neighbour); if (anchor) break; }
    if (!anchor) {
        const lastKey = Object.keys(JSON.parse(text)).pop();
        anchor = lastKey ? findEntry(text, lastKey) : null;
    }
    const indent = anchor ? anchor.indent : "    ";
    if (!anchor) {
        // An empty object: put the key in as the only entry.
        const close = text.lastIndexOf("}");
        return text.slice(0, close).replace(/\s+$/, "") + eol + indent + `"${key}": ${serialise(value)}` + eol + text.slice(close);
    }
    // Is the anchor followed by a comma (more entries) or is it the last entry?
    const rest = text.slice(anchor.valueEnd);
    const comma = /^[ \t]*,[ \t]*/.exec(rest);   // through any trailing blanks, so the new line starts clean
    if (comma) {
        const cut = anchor.valueEnd + comma[0].length;
        return text.slice(0, cut) + eol + indent + `"${key}": ${serialise(value)},` + text.slice(cut);
    }
    return text.slice(0, anchor.valueEnd) + "," + eol + indent + `"${key}": ${serialise(value)}` + text.slice(anchor.valueEnd);
}

/** Remove a top-level entry (and the comma that separated it). No-op when absent. */
function removeKey(text, key) {
    const entry = findEntry(text, key);
    if (!entry) return text;
    const rest = text.slice(entry.valueEnd);
    const trailing = /^[ \t]*,[ \t]*\r?\n?/.exec(rest);
    if (trailing) {
        // Not the last entry: drop from the start of its line through the comma and line break.
        return text.slice(0, entry.start) + text.slice(entry.valueEnd + trailing[0].length);
    }
    // Last entry: drop it and the comma that ended the previous entry.
    let cut = entry.start;
    while (cut > 0 && /\s/.test(text[cut - 1])) cut--;
    if (text[cut - 1] === ",") cut--;
    return text.slice(0, cut) + text.slice(entry.valueEnd);
}

/**
 * Apply a set of edits to a carfile's text. Pure: returns the new text and
 * the before/after objects, writes nothing.
 * @param {string} text
 * @param {{ set?: Object, remove?: string[], log?: Object }} ops
 *        log: an editLog entry to append ({ at, by, field, from, to, via })
 */
function patchCarfileText(text, ops = {}) {
    const before = JSON.parse(text);
    let out = text;
    for (const [key, value] of Object.entries(ops.set || {})) out = setKey(out, key, value);
    for (const key of ops.remove || []) out = removeKey(out, key);
    if (ops.log) out = setKey(out, "editLog", [...(Array.isArray(before.editLog) ? before.editLog : []), ops.log]);
    const after = JSON.parse(out);   // throws if an edit broke the file — nothing is written in that case
    return { text: out, before, after };
}

const carfilePath = (carID, dir = CARS_DIR) => path.join(dir, `${carID}.json`);

/** Patch any carfile by path (staging files included). */
function patchCarfileAt(file, ops, options = {}) {
    if (!existsSync(file)) throw new Error(`no carfile at ${file}`);
    const result = patchCarfileText(readFileSync(file, "utf8"), ops);
    if (options.write !== false) writeFileSync(file, result.text, "utf8");
    return { ...result, path: file };
}

/**
 * Patch one live carfile by ID. Returns the before/after objects and the new
 * text (so a caller can attach the file for a remote host).
 * @param {string} carID
 * @param {{ set?: Object, remove?: string[], log?: Object }} ops
 * @param {{ dir?: string, write?: boolean }} [options]
 */
function patchCarfile(carID, ops, options = {}) {
    const file = carfilePath(carID, options.dir);
    if (!existsSync(file)) throw new Error(`no carfile for ${carID}`);
    return patchCarfileAt(file, ops, options);
}

module.exports = { patchCarfile, patchCarfileAt, patchCarfileText, setKey, removeKey, findEntry, serialise, carfilePath, CARS_DIR, INSERT_AFTER };
