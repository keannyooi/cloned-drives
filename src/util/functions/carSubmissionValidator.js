"use strict";

/**
 * CAR SUBMISSION VALIDATOR
 * ========================
 * The roster is the dictionary. The accepted values for every closed field,
 * the casing they're written in, the tag list, the brand list and the
 * plausible stat bands are all derived from the cars already loaded — nothing
 * here is a hand-maintained list that can drift. (scripts/validateCars.js
 * keeps its own lists on purpose: it lints the roster itself, which a
 * roster-derived vocabulary by definition cannot.)
 *
 *   const { validateCarSubmission } = require("./carSubmissionValidator.js");
 *   const report = validateCarSubmission(fields, { isAdmin: false });
 *
 *   report.ok           nothing blocking
 *   report.car          the normalised car — carfile keys, carfile casing,
 *                       `cr` from the formula — ready to store or generate
 *   report.blockers     [{ field, message }]  must be fixed; nothing saves
 *   report.corrections  [{ field, from, to, message }]  what the bot changed
 *   report.warnings     [{ field, message }]  allowed, shown to the reviewer
 *   report.info         [{ field, message }]  FYI (sheet CR vs formula CR…)
 *   report.ignored      keys that were sent but are derived or admin-set
 *
 * One rule above all the matching: EXACT WINS. Fuzzy correction only runs
 * when nothing matches exactly, so AWD is never "corrected" to 4WD — both
 * are real values that mean different things to the race engine and to CR.
 */

const { compareTwoStrings, findBestMatch } = require("string-similarity");
const { computeCR } = require("./crFormula.js");
const { normalizeKey } = require("./carSubmissionParser.js");

// Fields a creator supplies. Everything else on a carfile is derived here or
// set by the reviewer at approval.
const CREATOR_FIELDS = [
    "make", "model", "modelYear", "country",
    "topSpeed", "0to60", "handling", "weight",
    "driveType", "tyreType", "gc", "seatCount", "bodyStyle",
    "tcs", "abs", "enginePos", "fuelType", "mra", "ola"
];
// power is optional: the engine estimates it when absent (scripts/estimatePowerAll.js).
const OPTIONAL_FIELDS = ["tags", "description", "power"];
const ENUM_FIELDS = ["driveType", "tyreType", "gc", "bodyStyle", "enginePos", "fuelType"];
const NUMERIC_FIELDS = ["topSpeed", "0to60", "handling", "weight", "mra", "ola", "seatCount", "power"];
const DERIVED_FIELDS = ["cr", "carID", "cardType", "racehud", "hiddenTag", "creator", "collection"];

// Human labels for messages (the template's spelling, not the JSON key).
const LABEL = {
    make: "make", model: "model", modelYear: "year", country: "country",
    topSpeed: "top speed", "0to60": "0-60", handling: "handling", weight: "weight",
    driveType: "drive", tyreType: "tyres", gc: "gc", seatCount: "seats", bodyStyle: "body",
    tcs: "tcs", abs: "abs", enginePos: "engine", fuelType: "fuel", mra: "mra", ola: "ola",
    power: "power", tags: "tags", description: "description"
};

// Spellings that are not typos of a roster value but a different word for it.
// Keyed by normalizeKey() of the input. Deliberately conservative: only
// unambiguous ones — "roadster" is NOT mapped, because this game splits open
// cars into Convertible and Open Air and only a person can say which.
const VALUE_ALIASES = {
    tyreType: { perf: "Performance", perfs: "Performance", std: "Standard", stock: "Standard", as: "All-Surface", allsurface: "All-Surface", allterrain: "All-Surface", or: "Off-Road", offroad: "Off-Road", slicks: "Slick", racing: "Slick", drags: "Drag" },
    driveType: { rear: "RWD", front: "FWD", rearwheeldrive: "RWD", frontwheeldrive: "FWD", allwheeldrive: "AWD", fourwheeldrive: "4WD", "4x4": "4WD" },
    gc: { l: "Low", m: "Medium", h: "High", med: "Medium", mid: "Medium", lo: "Low", hi: "High" },
    bodyStyle: { hatch: "Hatchback", cabrio: "Convertible", cabriolet: "Convertible", estate: "Wagon", saloon: "Sedan", suvs: "SUV", crossover: "SUV", truck: "Pickup", ute: "Pickup", pickuptruck: "Pickup" },
    enginePos: { mid: "Middle", midengine: "Middle", frontengine: "Front", rearengine: "Rear", f: "Front", m: "Middle", r: "Rear" },
    fuelType: { gas: "Petrol", gasoline: "Petrol", ice: "Petrol", ev: "Electric", bev: "Electric", electricity: "Electric", phev: "Hybrid", hev: "Hybrid", mhev: "Hybrid", hydrogen: "Alternative", lpg: "Alternative", cng: "Alternative", ethanol: "Alternative", methanol: "Alternative", steam: "Alternative" }
};

// Hard limits: outside these a value is not a car stat, whatever the roster
// says. Soft bands (warnings) come from the roster's 1st–99th percentiles.
const HARD = {
    topSpeed: [1, 400], "0to60": [0.4, 99.9], handling: [1, 150], weight: [1, 30000],
    mra: [0, 300], ola: [0, 200], seatCount: [0, 1000], power: [1, 5000]
};
const INTEGER_FIELDS = new Set(["topSpeed", "handling", "weight", "seatCount", "modelYear", "power"]);
// cd-carinfo shows the description in an embed field, which Discord caps at
// 1024 characters. The longest live description is 788; the BM modal's 500
// was a form-box limit, not a card limit, and 48 live cars exceed it.
const DESCRIPTION_MAX = 1000;
const SLOW_CAR_MPH = 60;          // below this the sheet forces 0-60 to 99.9
const SLOW_0TO60 = 99.9;

// ─── Vocabulary (derived from the loaded roster) ─────────────────────────────

let vocabulary = null;

function percentile(sorted, q) {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** Most-used casing wins: if the roster has "Coupe" 2,740 times that is the canonical spelling. */
function canonicalMap(counts) {
    const byNorm = new Map();     // norm → { canonical, count }
    for (const [value, count] of counts) {
        const key = normalizeKey(value);
        const existing = byNorm.get(key);
        if (!existing || count > existing.count) byNorm.set(key, { canonical: value, count: (existing ? existing.count : 0) + count });
        else existing.count += count;
    }
    return byNorm;
}

function buildVocabulary() {
    const dataManager = require("./dataManager.js");
    const { getBaseType, isBMCar } = require("./cardType.js");

    const counts = Object.fromEntries(ENUM_FIELDS.map(field => [field, new Map()]));
    const tagCounts = new Map(), makeCounts = new Map(), countryCounts = new Map();
    const numbers = Object.fromEntries(NUMERIC_FIELDS.map(field => [field, []]));
    const roster = [];
    let maxTags = 0;

    for (const file of dataManager.getCarFiles()) {
        const car = dataManager.getCar(file.replace(/\.json$/, ""));
        if (!car || isBMCar(car)) continue;
        const base = getBaseType(car);
        if (!base || /boss/i.test(base)) continue;
        if (typeof car.topSpeed !== "number") continue;     // stubs

        for (const field of ENUM_FIELDS) {
            const value = car[field];
            if (typeof value === "string" && value.trim() !== "") counts[field].set(value, (counts[field].get(value) || 0) + 1);
        }
        const makes = Array.isArray(car.make) ? car.make : [car.make];
        for (const make of makes) if (typeof make === "string" && make.trim()) makeCounts.set(make, (makeCounts.get(make) || 0) + 1);
        if (typeof car.country === "string" && car.country) countryCounts.set(car.country, (countryCounts.get(car.country) || 0) + 1);
        const tags = Array.isArray(car.tags) ? car.tags.filter(tag => typeof tag === "string" && tag !== "") : [];
        for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        if (tags.length > maxTags) maxTags = tags.length;
        for (const field of NUMERIC_FIELDS) if (typeof car[field] === "number") numbers[field].push(car[field]);

        roster.push({
            carID: car.carID || file.replace(/\.json$/, ""),
            make: makes[0] || "",
            makeNorm: normalizeKey(makes[0] || ""),
            model: String(car.model || ""),
            modelNorm: normalizeKey(car.model || ""),
            modelYear: car.modelYear,
            cr: car.cr
        });
    }

    const enums = {};
    for (const field of ENUM_FIELDS) {
        const byNorm = canonicalMap(counts[field]);
        enums[field] = {
            byNorm,
            options: [...byNorm.values()].sort((a, b) => b.count - a.count).map(entry => entry.canonical)
        };
    }
    const bands = {};
    for (const field of NUMERIC_FIELDS) {
        const sorted = numbers[field].sort((a, b) => a - b);
        bands[field] = { min: sorted[0], max: sorted[sorted.length - 1], p1: percentile(sorted, 0.01), p99: percentile(sorted, 0.99) };
    }

    vocabulary = {
        enums,
        tags: canonicalMap(tagCounts),
        makes: canonicalMap(makeCounts),
        countries: new Set(countryCounts.keys()),
        bands,
        maxTags,
        roster,
        cars: roster.length,
        builtAt: Date.now()
    };
    return vocabulary;
}

/** Built on first use, after dataManager has loaded; rebuild after a reload. */
function getVocabulary(force = false) {
    if (!vocabulary || force) buildVocabulary();
    return vocabulary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isBlank = value => value === undefined || value === null || String(value).trim() === "";

/** A raw value as a trimmed string; arrays joined with ", " so both paste shapes read the same. */
function asText(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).join(", ");
    return String(value).trim();
}

/** "a, b; c" or ["a","b"] → ["a", "b", "c"] — trimmed, non-empty, de-duplicated (case-insensitive). */
function asList(value) {
    const items = Array.isArray(value) ? value.map(item => String(item)) : String(value).split(/[,;|\n]/);
    const seen = new Set();
    const out = [];
    for (const raw of items) {
        const item = raw.trim();
        if (!item) continue;
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

const TRUE_WORDS = new Set(["yes", "y", "true", "t", "1", "on", "present", "has", "fitted", "standard"]);
const FALSE_WORDS = new Set(["no", "n", "false", "f", "0", "off", "none", "absent", "not", "nope"]);

function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const word = String(value).trim().toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    return null;
}

/**
 * A number out of whatever was typed. Handles thousands separators
 * ("1,450"), a decimal comma on the fields that take decimals ("3,2"),
 * trailing units, and converts km/h → mph and lb → kg (with a note).
 */
function parseNumber(value, field) {
    if (typeof value === "number") return Number.isFinite(value) ? { value } : null;
    let text = String(value).trim().toLowerCase();
    if (!text) return null;

    if ((field === "mra" || field === "ola") && /^(\/|n\/?a|none|-|—)$/.test(text)) {
        return { value: 0, note: `"${text}" means 0` };
    }

    let factor = 1, note = null;
    if (field === "topSpeed" && /(km\s*\/?\s*h|kph|kmh)/.test(text)) { factor = 0.621371; note = "converted from km/h"; }
    if (field === "weight" && /(lbs?|pounds?)\b/.test(text)) { factor = 0.453592; note = "converted from lb"; }
    // power is stored in PS (metric horsepower): kW ×1.36, hp ×1.014
    if (field === "power" && /\d\s*kw\b|kilowatt/.test(text)) { factor = 1.35962; note = "converted from kW"; }
    else if (field === "power" && /\d\s*(b|w)?hp\b|horsepower/.test(text)) { factor = 1.01387; note = "converted from hp"; }
    else if (field === "power" && !/\d\s*(ps|cv|pk)\b/.test(text)) note = "no unit given — read as PS (write hp or kW if that is what you have)";

    const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    let digits = match[0];
    const decimalComma = /^-?\d+,\d{1,2}$/.test(digits) && !INTEGER_FIELDS.has(field);
    digits = decimalComma ? digits.replace(",", ".") : digits.replace(/,/g, "");
    let number = Number(digits) * factor;
    if (!Number.isFinite(number)) return null;
    if (factor !== 1) number = Math.round(number);
    return { value: number, note };
}

/**
 * Match typed text against a closed vocabulary. Exact (case-insensitive,
 * punctuation-insensitive) first, then alias, then a unique prefix of at
 * least three letters, then similarity. Returns how it matched so the
 * caller can decide between silent acceptance, a correction note, or a
 * "did you mean" block.
 */
function matchOption(input, byNorm, aliases) {
    const key = normalizeKey(input);
    if (!key) return { how: null, candidates: [] };
    const exact = byNorm.get(key);
    if (exact) return { value: exact.canonical, how: "exact" };
    if (aliases && aliases[key]) return { value: aliases[key], how: "alias" };

    const options = [...byNorm.values()].map(entry => entry.canonical);
    const norms = options.map(normalizeKey);
    if (key.length >= 3) {
        const prefixed = options.filter((option, index) => norms[index].startsWith(key));
        if (prefixed.length === 1) return { value: prefixed[0], how: "prefix" };
    }
    if (options.length === 0) return { how: null, candidates: [] };
    const { ratings } = findBestMatch(key, norms);
    const ranked = ratings.map((rating, index) => ({ option: options[index], rating: rating.rating }))
        .sort((a, b) => b.rating - a.rating);
    if (ranked[0].rating >= 0.75) return { value: ranked[0].option, how: "fuzzy" };
    return { how: null, candidates: ranked.filter(entry => entry.rating >= 0.4).slice(0, 3).map(entry => entry.option) };
}

// ─── The validator ───────────────────────────────────────────────────────────

/**
 * @param {Object} fields   raw fields from carSubmissionParser (canonical keys)
 * @param {Object} [options]
 * @param {boolean} [options.isAdmin=false]  admins may use reserved tags and tags not on any car
 * @param {string[]} [options.reservedTags]  tags creators may not use (defaults to consts.reservedSubmissionTags)
 * @param {string[]} [options.unknownKeys]   keys the parser could not place (reported as blockers)
 * @param {string[]} [options.optionalFields] creator fields allowed to be blank — `cd-calc compare` leaves
 *                                             handling out on purpose; CR is then not computed
 */
function validateCarSubmission(fields, options = {}) {
    const vocab = getVocabulary();
    const isAdmin = options.isAdmin === true;
    const report = { ok: false, car: null, blockers: [], corrections: [], warnings: [], info: [], ignored: [] };
    const block = (field, message) => report.blockers.push({ field, message });
    const correct = (field, from, to, message) => report.corrections.push({ field, from, to, message });
    const warn = (field, message) => report.warnings.push({ field, message });
    const note = (field, message) => report.info.push({ field, message });
    const car = {};

    for (const key of options.unknownKeys || []) {
        block(key, `\`${key}\` isn't a field. Fields: ${Object.values(LABEL).join(", ")}.`);
    }
    for (const key of DERIVED_FIELDS) {
        if (fields[key] !== undefined && !isBlank(fields[key])) report.ignored.push(key);
    }

    // Presence, first — so a half-filled paste gets one list of what's missing.
    const optional = new Set(options.optionalFields || []);
    const absent = CREATOR_FIELDS.filter(field => isBlank(fields[field]));
    const missing = absent.filter(field => !optional.has(field));
    for (const field of missing) block(field, `\`${LABEL[field]}\` is missing.`);

    // ── make ──
    if (!absent.includes("make")) {
        const makes = asList(fields.make);
        if (makes.length === 0) block("make", "`make` is empty.");
        car.make = makes.map(make => {
            const match = vocab.makes.get(normalizeKey(make));
            if (match) {
                if (match.canonical !== make) correct("make", make, match.canonical, `brand casing fixed to how the roster writes it`);
                return match.canonical;
            }
            const known = [...vocab.makes.values()].map(entry => entry.canonical);
            const nearest = known.length ? findBestMatch(normalizeKey(make), known.map(normalizeKey)) : null;
            if (nearest && nearest.bestMatch.rating >= 0.8) {
                warn("make", `\`${make}\` isn't a brand in the game yet — did you mean **${known[nearest.bestMatchIndex]}**? Kept as typed.`);
            }
            else warn("make", `\`${make}\` is a new brand (no car in the game has it). Check the spelling.`);
            return make;
        });
    }

    // ── year ── (needed before model so the "(2023)" strip can compare)
    if (!absent.includes("modelYear")) {
        const parsed = parseNumber(fields.modelYear, "modelYear");
        const maxYear = new Date().getUTCFullYear() + 2;
        if (!parsed || !Number.isInteger(parsed.value)) block("modelYear", `\`year\` must be a whole number, got \`${asText(fields.modelYear)}\`.`);
        else if (parsed.value < 1885 || parsed.value > maxYear) block("modelYear", `\`year\` ${parsed.value} is outside 1885–${maxYear}.`);
        else car.modelYear = parsed.value;
    }

    // ── model ──
    if (!absent.includes("model")) {
        let model = asText(fields.model).replace(/\s+/g, " ");
        const original = model;
        if (car.modelYear) {
            // Only a year that stands on its own — " (2023)" or " 2023" — is the
            // creator repeating the year field. "LMP2000" and "X2010" are names.
            const yearTail = new RegExp(`(?:\\s+\\(?|\\()${car.modelYear}\\)?\\s*$`);
            if (yearTail.test(model) && model.replace(yearTail, "").trim()) model = model.replace(yearTail, "").trim();
        }
        if (car.make && car.make.length) {
            const lead = car.make[0];
            if (model.toLowerCase().startsWith(lead.toLowerCase() + " ") && model.length > lead.length + 1) model = model.slice(lead.length + 1).trim();
        }
        if (model !== original) correct("model", original, model, "the brand and the year are separate fields — removed from the model");
        if (!model) block("model", "`model` is empty once the brand and year are taken out.");
        else if (model.length > 80) block("model", `\`model\` is ${model.length} characters; keep it under 80.`);
        else car.model = model;
    }

    // ── country ──
    if (!absent.includes("country")) {
        const country = asText(fields.country).toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) block("country", `\`country\` must be a two-letter code like DE or GB, got \`${asText(fields.country)}\`.`);
        else {
            car.country = country;
            if (!vocab.countries.has(country)) warn("country", `\`${country}\` is a country code no car in the game uses yet. Check it.`);
        }
    }

    // ── closed vocabularies ──
    for (const field of ENUM_FIELDS) {
        if (absent.includes(field)) continue;
        const typed = asText(fields[field]);
        const match = matchOption(typed, vocab.enums[field].byNorm, VALUE_ALIASES[field]);
        if (!match.how) {
            const options = vocab.enums[field].options;
            const hint = match.candidates.length ? `Did you mean **${match.candidates.join("** / **")}**? ` : "";
            block(field, `\`${LABEL[field]}: ${typed}\` isn't a value. ${hint}Accepted: ${options.join(", ")}.`);
            continue;
        }
        car[field] = match.value;
        if (match.how !== "exact" && normalizeKey(typed) !== normalizeKey(match.value)) {
            correct(field, typed, match.value, match.how === "alias" ? "another word for the same thing" : "closest accepted value");
        }
    }

    // ── booleans ──
    for (const field of ["tcs", "abs"]) {
        if (absent.includes(field)) continue;
        const value = parseBoolean(fields[field]);
        if (value === null) block(field, `\`${LABEL[field]}\` must be yes or no, got \`${asText(fields[field])}\`.`);
        else car[field] = value;
    }

    // ── numbers ──
    for (const field of NUMERIC_FIELDS) {
        if (absent.includes(field)) continue;
        if (OPTIONAL_FIELDS.includes(field) && isBlank(fields[field])) continue;     // optional numbers may be left out
        const parsed = parseNumber(fields[field], field);
        if (!parsed) {
            block(field, field === "power"
                ? `\`power\` must be a number in PS, hp or kW, got \`${asText(fields[field])}\`. (Fuel type goes under \`fuel\`.)`
                : `\`${LABEL[field]}\` must be a number, got \`${asText(fields[field])}\`.`);
            continue;
        }
        let value = parsed.value;
        if (INTEGER_FIELDS.has(field) && !Number.isInteger(value)) {
            const rounded = Math.round(value);
            correct(field, value, rounded, "whole numbers only");
            value = rounded;
        }
        if (parsed.note) correct(field, asText(fields[field]), value, parsed.note);
        const [low, high] = HARD[field];
        if (value < low || value > high) { block(field, `\`${LABEL[field]}\` ${value} is outside ${low}–${high}.`); continue; }
        car[field] = value;
    }

    // ── cross rules (the sheet's own) ──
    if (typeof car.topSpeed === "number" && typeof car["0to60"] === "number") {
        if (car.topSpeed < SLOW_CAR_MPH && car["0to60"] !== SLOW_0TO60) {
            correct("0to60", car["0to60"], SLOW_0TO60, `cars under ${SLOW_CAR_MPH} mph always carry 0-60 = ${SLOW_0TO60}`);
            car["0to60"] = SLOW_0TO60;
        }
        else if (car.topSpeed >= SLOW_CAR_MPH && car["0to60"] === SLOW_0TO60) {
            warn("0to60", `0-60 is ${SLOW_0TO60} (the "can't do it" value) but top speed is ${car.topSpeed} mph.`);
        }
    }

    // ── soft bands: allowed, but the reviewer should see them ──
    for (const field of NUMERIC_FIELDS) {
        if (typeof car[field] !== "number") continue;
        const band = vocab.bands[field];
        if (!band) continue;
        if (field === "0to60" && car[field] === SLOW_0TO60) continue;
        if (car[field] < band.p1) warn(field, `\`${LABEL[field]}\` ${car[field]} is lower than 99% of cars (they start around ${band.p1}).`);
        else if (car[field] > band.p99 && !(field === "0to60")) warn(field, `\`${LABEL[field]}\` ${car[field]} is higher than 99% of cars (they top out around ${band.p99}).`);
    }

    // ── tags ──
    const reserved = new Set((options.reservedTags || defaultReservedTags()).map(tag => normalizeKey(tag)));
    car.tags = [];
    if (!isBlank(fields.tags)) {
        for (const typed of asList(fields.tags)) {
            const match = matchOption(typed, vocab.tags, null);
            if (!match.how) {
                if (isAdmin) { car.tags.push(typed); note("tags", `\`${typed}\` is a tag no car has yet — added as typed (admin).`); continue; }
                const hint = match.candidates.length ? ` Did you mean **${match.candidates.join("** / **")}**?` : "";
                block("tags", `\`${typed}\` isn't a tag in the game.${hint}`);
                continue;
            }
            if (reserved.has(normalizeKey(match.value)) && !isAdmin) {
                block("tags", `\`${match.value}\` is a reserved tag — event and system tags are added by the reviewer.`);
                continue;
            }
            if (!car.tags.includes(match.value)) car.tags.push(match.value);
            if (match.how !== "exact" || match.value !== typed) {
                if (normalizeKey(typed) === normalizeKey(match.value)) correct("tags", typed, match.value, "tag casing fixed");
                else correct("tags", typed, match.value, "closest existing tag");
            }
        }
        if (vocab.maxTags && car.tags.length > vocab.maxTags) warn("tags", `${car.tags.length} tags — no car in the game has more than ${vocab.maxTags}.`);
    }

    // ── description ──
    car.description = isBlank(fields.description) ? "" : asText(fields.description).replace(/\s+/g, " ");
    if (car.description.length > DESCRIPTION_MAX) block("description", `\`description\` is ${car.description.length} characters; the limit is ${DESCRIPTION_MAX}.`);

    // ── CR (never typed) ──
    if (report.blockers.length === 0) {
        car.cr = computeCR(car);
        if (car.cr === null) {
            if (optional.size) { delete car.cr; note("cr", "CR not computed — a stat the formula needs was left out."); }
            else block("cr", "could not compute CR from these stats.");
        }
        else if (!isBlank(fields.cr)) {
            const claimed = parseNumber(fields.cr, "cr");
            if (claimed && Math.abs(claimed.value - car.cr) > 5) note("cr", `your sheet says CR ${claimed.value}, the formula says ${car.cr} — the formula is used.`);
        }
    }

    // ── already in the game? ──
    if (car.make && car.model && car.modelYear) {
        const similar = findSimilarCars(car, vocab);
        if (similar.length && similar[0].score >= 0.999) {
            warn("model", `already in the game as \`${similar[0].carID}\` — **${similar[0].name}** (CR ${similar[0].cr}). Updates to existing cars go through an admin.`);
        }
        else if (similar.length && similar[0].score >= 0.9) {
            warn("model", `very close to an existing car: ${similar.slice(0, 2).map(entry => `\`${entry.carID}\` ${entry.name}`).join(", ")}.`);
        }
        else if (similar.length) {
            note("model", `closest existing cars: ${similar.slice(0, 3).map(entry => `\`${entry.carID}\` ${entry.name}`).join(", ")}.`);
        }
    }

    report.ok = report.blockers.length === 0;
    report.car = report.ok ? orderCar(car) : car;
    return report;
}

/**
 * Same brand, similar model, year as a tiebreak. Exact name+year scores 1.
 * Only cars of the same lead brand are compared — a "911" from another
 * brand isn't a duplicate of anything.
 */
function findSimilarCars(car, vocab = getVocabulary()) {
    const makeNorm = normalizeKey(car.make[0] || "");
    const modelNorm = normalizeKey(car.model);
    const out = [];
    for (const entry of vocab.roster) {
        if (entry.makeNorm !== makeNorm) continue;
        let score = entry.modelNorm === modelNorm ? 1 : compareTwoStrings(modelNorm, entry.modelNorm);
        if (score < 0.6) continue;
        if (entry.modelYear !== car.modelYear) score -= score === 1 ? 0.05 : 0.1;
        out.push({ carID: entry.carID, name: `${entry.make} ${entry.model} (${entry.modelYear})`, cr: entry.cr, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

function defaultReservedTags() {
    try {
        const consts = require("../consts/consts.js");
        if (Array.isArray(consts.reservedSubmissionTags)) return consts.reservedSubmissionTags;
    }
    catch (error) {
        // consts unavailable in a bare test — fall through
    }
    return ["Token"];
}

/** Carfile key order, so a stored car reads like a carfile and diffs cleanly. */
function orderCar(car) {
    const ordered = {};
    for (const key of ["cr", "make", "model", "modelYear", "country", "topSpeed", "0to60", "handling", "driveType", "tyreType", "tags", "weight", "gc", "seatCount", "bodyStyle", "tcs", "abs", "enginePos", "fuelType", "mra", "ola", "power", "description"]) {
        if (car[key] !== undefined) ordered[key] = car[key];
    }
    return ordered;
}

/** Plain-text rendering of a report — used by tests and as the DM fallback. */
function describeReport(report) {
    const lines = [];
    for (const entry of report.blockers) lines.push(`❌ ${entry.message}`);
    for (const entry of report.corrections) lines.push(`✏️ ${LABEL[entry.field] || entry.field}: \`${entry.from}\` → **${entry.to}** (${entry.message})`);
    for (const entry of report.warnings) lines.push(`⚠️ ${entry.message}`);
    for (const entry of report.info) lines.push(`ℹ️ ${entry.message}`);
    if (report.ignored.length) lines.push(`ℹ️ ignored: ${report.ignored.join(", ")} — ${report.ignored.includes("cr") ? "CR is computed from the stats; " : ""}these are set by the bot or the reviewer.`);
    return lines;
}

module.exports = {
    validateCarSubmission,
    findSimilarCars,
    describeReport,
    getVocabulary,
    buildVocabulary,
    parseNumber,
    parseBoolean,
    matchOption,
    CREATOR_FIELDS,
    OPTIONAL_FIELDS,
    ENUM_FIELDS,
    NUMERIC_FIELDS,
    LABEL,
    DESCRIPTION_MAX
};
