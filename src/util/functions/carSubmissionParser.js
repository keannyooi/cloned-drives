"use strict";

/**
 * CAR SUBMISSION PARSER
 * =====================
 * Turns whatever a creator pastes into one raw field map per car. Three input
 * shapes, detected in this order:
 *
 *   1. JSON — a carfile object, or an array of them. Includes the CSV-escaped
 *      form Google Sheets produces when a cell holding JSON is copied (the
 *      whole document wrapped in quotes with every quote doubled), and two or
 *      more objects pasted back to back.
 *   2. CSV — a header row of field names and one car per row. This is what
 *      File → Download → CSV gives from the sheet.
 *   3. key: value lines — the template. Several cars are separated by a line
 *      of --- ; a second `make:` line also starts a new car.
 *
 * Output values are RAW: strings, or the arrays/numbers/booleans JSON gave us.
 * The validator does every coercion and every judgement. The parser answers
 * two questions only — "which field did they mean" (the alias table) and
 * "how many cars are in here".
 */

// Canonical carfile keys, in carfile order. Everything after `description`
// is something the bot derives or the reviewer sets; the parser still
// recognises those keys so the validator can say "ignored" rather than
// "unknown".
const CANONICAL_FIELDS = [
    "make", "model", "modelYear", "country",
    "topSpeed", "0to60", "handling", "weight",
    "driveType", "tyreType", "gc", "seatCount", "bodyStyle",
    "tcs", "abs", "enginePos", "fuelType", "mra", "ola",
    "tags", "description",
    "creator", "cr", "carID", "cardType", "racehud", "hiddenTag", "collection"
];

// Spellings people naturally write, per canonical key. Compared after
// normalizeKey(): lowercase, letters and digits only — so "Top Speed",
// "top_speed", "topSpeed" and "TOPSPEED" are all the same entry.
const ALIASES = {
    make: ["make", "brand", "manufacturer", "marque"],
    model: ["model", "name", "carname", "modelname"],
    modelYear: ["modelyear", "year", "my"],
    country: ["country", "countrycode", "origin", "nation"],
    topSpeed: ["topspeed", "top", "speed", "vmax", "maxspeed", "topspeedmph"],
    "0to60": ["0to60", "060", "0to60s", "accel", "acceleration", "zerotosixty", "zero60"],
    handling: ["handling", "hand", "grip"],
    weight: ["weight", "mass", "kerbweight", "curbweight", "weightkg"],
    driveType: ["drivetype", "drive", "drivetrain", "driven", "wd"],
    tyreType: ["tyretype", "tyres", "tyre", "tires", "tire", "tiretype", "rubber"],
    gc: ["gc", "groundclearance", "clearance", "rideheight", "ride"],
    seatCount: ["seatcount", "seats", "seat", "seating"],
    bodyStyle: ["bodystyle", "body", "style", "bodytype"],
    tcs: ["tcs", "tractioncontrol", "tc", "traction"],
    abs: ["abs", "antilock", "antilockbrakes"],
    enginePos: ["enginepos", "engine", "engineposition", "layout", "engineplacement", "engineposition"],
    fuelType: ["fueltype", "fuel", "powertrain", "energy"],
    mra: ["mra"],
    ola: ["ola"],
    power: ["power", "ps", "hp", "bhp", "horsepower", "enginepower", "output", "kw", "powerps"],
    tags: ["tags", "tag"],
    description: ["description", "desc", "blurb", "bio", "text"],
    creator: ["creator", "author", "by"],
    cr: ["cr", "rating"],
    carID: ["carid", "id"],
    cardType: ["cardtype", "type"],
    racehud: ["racehud", "hud", "image", "art", "artwork", "imageurl"],
    hiddenTag: ["hiddentag", "hiddentags"],
    collection: ["collection", "collections"]
};

const ALIAS_LOOKUP = new Map();
for (const [canonical, spellings] of Object.entries(ALIASES)) {
    for (const spelling of spellings) ALIAS_LOOKUP.set(spelling, canonical);
}

/** "Top Speed (mph)" → "topspeedmph"; "0-60" → "060". */
function normalizeKey(key) {
    return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The canonical key a spelling means, or null when it means nothing we know. */
function canonicalKey(key) {
    return ALIAS_LOOKUP.get(normalizeKey(key)) || null;
}

// ─── Pre-processing ──────────────────────────────────────────────────────────

/**
 * Strip what Discord and spreadsheets wrap around the actual content: a BOM,
 * Windows line endings, ``` fences (with or without a language tag), and the
 * one-line `key: value` inside single backticks nobody means literally.
 */
function cleanText(raw) {
    let text = String(raw || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    text = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "");
    return text.trim();
}

/**
 * The spreadsheet-escaped form: whole text in quotes, inner quotes doubled.
 * Same repair stagingCars.parseTolerantly does for files on disk.
 */
function unescapeSpreadsheet(text) {
    let inner = text.trim();
    if (inner.startsWith("\"") && inner.endsWith("\"")) inner = inner.slice(1, -1);
    return inner.replace(/""/g, "\"");
}

// ─── JSON ────────────────────────────────────────────────────────────────────

function tryParseJSON(text) {
    const attempts = [
        text,
        unescapeSpreadsheet(text),
        // Two or more objects pasted back to back: {..}{..} or {..}\n{..}
        `[${text.replace(/}\s*,?\s*{/g, "},{")}]`,
        `[${unescapeSpreadsheet(text).replace(/}\s*,?\s*{/g, "},{")}]`
    ];
    for (const attempt of attempts) {
        const trimmed = attempt.trim();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object") return parsed;
        }
        catch (error) {
            // try the next repair
        }
    }
    return null;
}

function fieldsFromObject(object) {
    const fields = {};
    const unknownKeys = [];
    for (const [key, value] of Object.entries(object)) {
        const canonical = canonicalKey(key);
        if (!canonical) { unknownKeys.push(key); continue; }
        fields[canonical] = value;
    }
    return { fields, unknownKeys };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** RFC 4180: quoted cells, doubled quotes inside them, newlines inside quotes. */
function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === "\"") {
                if (text[i + 1] === "\"") { cell += "\""; i++; }
                else inQuotes = false;
            }
            else cell += ch;
        }
        else if (ch === "\"") inQuotes = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
        else cell += ch;
    }
    if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
    return rows.filter(cells => cells.some(value => value.trim() !== ""));
}

/** A first line that reads as a header: several cells, most of them field names. */
function looksLikeCSV(text) {
    const firstLine = text.split("\n")[0] || "";
    if (firstLine.includes(":") && !firstLine.includes(",")) return false;
    const cells = parseCSV(firstLine)[0] || [];
    if (cells.length < 4) return false;
    const known = cells.filter(cell => canonicalKey(cell)).length;
    return known >= 4 && known >= cells.length / 2;
}

function carsFromCSV(text) {
    const rows = parseCSV(text);
    const header = rows.shift() || [];
    const columns = header.map(cell => ({ raw: cell.trim(), canonical: canonicalKey(cell) }));
    const unknownColumns = columns.filter(column => !column.canonical && column.raw !== "").map(column => column.raw);
    const cars = rows.map(cells => {
        const fields = {};
        columns.forEach((column, index) => {
            if (!column.canonical) return;
            const value = (cells[index] || "").trim();
            if (value !== "") fields[column.canonical] = value;
        });
        return { fields, unknownKeys: unknownColumns };
    });
    return cars;
}

// ─── key: value ──────────────────────────────────────────────────────────────

const SEPARATOR_LINE = /^\s*(?:-{3,}|={3,}|_{3,}|\*{3,})\s*$/;
// A stray leading quote is tolerated on a key line — see unwrapBlock.
const KEY_VALUE_LINE = /^\s*"?\s*([A-Za-z0-9 _\-()/]{1,40}?)\s*:\s*(.*)$/;

/**
 * A block copied out of a spreadsheet cell arrives wrapped in double quotes,
 * with any quote inside it doubled — the same CSV escaping the JSON path
 * repairs. Each cell is wrapped on its own, so this runs per block.
 *
 * Two partial cases also happen: several cells pasted together where the
 * closing quote of one cell and the opening quote of the next straddle a
 * separator, and one cell holding a `---` inside it, where the wrap spans
 * both blocks. Those leave a lone quote opening the first key line or
 * closing the last value; both are stripped.
 */
function unwrapBlock(lines) {
    const joined = lines.join("\n").trim();
    if (joined.length >= 2 && joined.startsWith("\"") && joined.endsWith("\"")) {
        return unescapeSpreadsheet(joined).split("\n");
    }
    const out = [...lines];
    let touched = false;
    const first = out.findIndex(line => line.trim() !== "");
    if (first >= 0 && /^\s*"/.test(out[first])) { out[first] = out[first].replace(/^\s*"/, ""); touched = true; }
    let last = out.length - 1;
    while (last >= 0 && out[last].trim() === "") last--;
    // Only an UNPAIRED trailing quote is a wrapper; `He said "hi"` keeps its quotes.
    if (last >= 0 && /"\s*$/.test(out[last]) && (out[last].match(/"/g) || []).length % 2 === 1) {
        out[last] = out[last].replace(/"\s*$/, "");
        touched = true;
    }
    return touched ? out.map(line => line.replace(/""/g, "\"")) : out;
}

function carsFromKeyValue(text) {
    const blocks = [[]];
    for (const line of text.split("\n")) {
        if (SEPARATOR_LINE.test(line)) { blocks.push([]); continue; }
        blocks[blocks.length - 1].push(line);
    }

    const cars = [];
    for (const rawLines of blocks) {
        const lines = unwrapBlock(rawLines);
        let current = null;
        let lastKey = null;
        const open = () => { current = { fields: {}, unknownKeys: [] }; cars.push(current); lastKey = null; };

        for (const rawLine of lines) {
            const line = rawLine.replace(/^\s*[-•*]\s+/, "");     // tolerate bullet lists
            if (line.trim() === "") continue;
            const match = line.match(KEY_VALUE_LINE);
            const canonical = match ? canonicalKey(match[1]) : null;

            if (canonical) {
                // A second `make:` in the same block is a second car.
                if (canonical === "make" && current && current.fields.make !== undefined) open();
                if (!current) open();
                const value = match[2].trim();
                if (current.fields[canonical] !== undefined && typeof current.fields[canonical] === "string" && value !== "") {
                    // Repeated key (two `tags:` lines) — join rather than lose one.
                    current.fields[canonical] = `${current.fields[canonical]}, ${value}`;
                }
                else current.fields[canonical] = value;
                lastKey = canonical;
                continue;
            }

            // Not a field we know. Inside a description it is a wrapped line
            // (descriptions have colons in them all the time); otherwise it is
            // either an unknown key or free text the creator didn't mean to send.
            if (current && lastKey === "description") {
                current.fields.description = `${current.fields.description} ${line.trim()}`.trim();
                continue;
            }
            if (match) {
                if (!current) open();
                current.unknownKeys.push(match[1].trim());
            }
            // Free text before the first field (a greeting, "here you go") is ignored.
        }
    }
    return cars.filter(car => Object.keys(car.fields).length > 0);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * @param {string} raw - what the creator sent (message text or file contents)
 * @returns {{ source: "json"|"csv"|"kv"|"empty", cars: Array<{index:number, fields:Object, unknownKeys:string[]}> }}
 */
function parseCarSubmissionText(raw) {
    const text = cleanText(raw);
    if (!text) return { source: "empty", cars: [] };

    const json = tryParseJSON(text);
    if (json) {
        const objects = Array.isArray(json) ? json.filter(item => item && typeof item === "object") : [json];
        return { source: "json", cars: objects.map((object, index) => ({ index, ...fieldsFromObject(object) })) };
    }

    if (looksLikeCSV(text)) {
        return { source: "csv", cars: carsFromCSV(text).map((car, index) => ({ index, ...car })) };
    }

    return { source: "kv", cars: carsFromKeyValue(text).map((car, index) => ({ index, ...car })) };
}

/** The blank template a creator fills in. Kept here so the command and the docs agree. */
const TEMPLATE = [
    "make: ", "model: ", "year: ", "country: ",
    "top speed: ", "0-60: ", "handling: ", "weight: ",
    "drive: ", "tyres: ", "gc: ", "seats: ", "body: ",
    "tcs: ", "abs: ", "engine: ", "fuel: ", "mra: ", "ola: ",
    "tags: ", "description: ",
    "power: "                                   // optional — PS, hp or kW; estimated when blank
].join("\n");

module.exports = {
    parseCarSubmissionText,
    parseCSV,
    canonicalKey,
    normalizeKey,
    cleanText,
    CANONICAL_FIELDS,
    TEMPLATE
};
