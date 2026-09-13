"use strict";

const { ErrorMessage, SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { modifiedBase } = require("../util/functions/cardType.js");
const search = require("../util/functions/search.js");
const { parseCarSubmissionText } = require("../util/functions/carSubmissionParser.js");
const { validateCarSubmission } = require("../util/functions/carSubmissionValidator.js");
const { findComparables, formatLine } = require("../util/functions/handlingComparables.js");

// `cd-calc compare` accepts a cd-submit car block with these fields left out.
// The comparison only needs the stats the neighbour search reads.
const COMPARE_OPTIONAL = ["handling", "mra", "ola", "country", "seatCount", "tcs", "abs", "fuelType", "description"];

module.exports = {
    name: "calculate",
    aliases: ["calc", "cal"],
    usage: [
        "compare <car name | -carID>",
        "compare <pasted cd-submit car block, handling line optional>",
        "handling <skidpad value>",
        "mra <0-60mph time> <0-100mph time>",
        "ola <0-30mph time> <0-60mph time>",
        "handlingest <original skidpad value> <original 0-60mph time> <new 0-60mph time> <original weight (kg)> <new weight (kg)>",
        "average <value 1> <value 2> <value 3> <...etc>"
    ],
    args: 2,
    category: "Miscellaneous",
    description: `This command supports 6 calculation functions and they are as follows:
    - **Handling comparables (ID: \`compare\`).** Shows where cars like the one you name (or paste as a \`cd-submit car\` block, handling line optional) sit for handling: the closest cars on the same tyres, same-brand cars first, the band they span, and any car in its class it beats or loses to on every stat. A spread, not a verdict.
    - **Handling calculation (ID: \`handling\`).** Cloned Drives calculates handling for cars from their skidpad G values (real or estmiated).
    **Formula:** \`lateral g-force * 90\`
    - **Mid-range acceleration (MRA) calculation (ID: \`mra\`).**
    **Formula:** \`100 * (0-60mph time / (0-100mph time - 0-60mph time))\`
    - **Off-the-line acceleration (OLA) calculation (ID: \`ola\`).**
    **Formula:** \`100 * (0-30mph time / (0-60mph time / 2))\`
    - **Skidpad value estimation (ID: \`handlingest\`).** This formula only works for cars that share the same chassis/platform.
    **Formula:** \`original skidpad g * (((original 0-60 time / new 0-60 time) + (original weight / new weight)) / 2) ^ (1 / 3)\`
    - **Averaging of values (ID: \`average\`).** This is self explanatory.`,
    async execute(message, args) {
        if (["compare", "comps", "similar"].includes(args[0].toLowerCase())) {
            return compareHandling(message, args);
        }

        const numberArgs = args.slice(1, args.length);
        let answer;

        if (numberArgs.find(i => isNaN(i))) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, one or more arguments provided not a number.",
                desc: "Syntax examples are available by running `cd-help calculate`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        else {
            let calcFunction = args[0].toLowerCase();
            switch (calcFunction) {
                case "handling":
                    if (numberArgs[0] > 1 && numberArgs[0] <= 1.0165) {
                        answer = 90;
                    }
                    else if (numberArgs[0] > 1.0165 && numberArgs[0] <= 1.0495) {
                        answer = 91;
                    }
                    else if (numberArgs[0] > 1.0495 && numberArgs[0] <= 1.0825) {
                        answer = 92;
                    }
                    else if (numberArgs[0] > 1.0825 && numberArgs[0] <= 1.125) {
                        answer = 93;
                    }
                    else if (numberArgs[0] > 1.125 && numberArgs[0] <= 1.175) {
                        answer = 94;
                    }
                    else if (numberArgs[0] > 1.175 && numberArgs[0] <= 1.25) {
                        answer = 95;
                    }
                    else if (numberArgs[0] > 1.25 && numberArgs[0] <= 1.35) {
                        answer = 96;
                    }
                    else if (numberArgs[0] > 1.35 && numberArgs[0] <= 1.45) {
                        answer = 97;
                    }
                    else if (numberArgs[0] > 1.45 && numberArgs[0] <= 1.625) {
                        answer = 98;
                    }
                    else if (numberArgs[0] > 1.625 && numberArgs[0] <= 1.875) {
                        answer = 99;
                    }
                    else if (numberArgs[0] > 1.875 && numberArgs[0] <= 2) {
                        answer = 100;
                    }
                    else if (numberArgs[0] > 2 && numberArgs[0] <= 2.9) {
                        answer = 101;
                    }
                    else if (numberArgs[0] > 2.9 && numberArgs[0] <= 3.9) {
                        answer = 102;
                    }
                    else if (numberArgs[0] > 3.9 && numberArgs[0] <= 4.9) {
                        answer = 103;
                    }
                    else if (numberArgs[0] > 4.9 && numberArgs[0] <= 5.9) {
                        answer = 104;
                    }
                    else if (numberArgs[0] > 5.9) {
                        answer = 105;
                    }
                    else {
                        answer = Math.round(numberArgs[0] * 90);
                    }
                    break;
                case "handlingest":
                    let latG = numberArgs[0], oldAccel = numberArgs[1], newAccel = numberArgs[2];
                    let oldWeight = numberArgs[3], newWeight = numberArgs[4];
                    answer = latG * Math.cbrt(((oldAccel / newAccel) + (oldWeight / newWeight)) / 2);
                    answer = answer.toFixed(2);
                    break;
                case "mra":
                    answer = (100 * (numberArgs[0] / (numberArgs[1] - numberArgs[0]))).toFixed(2);
                    break;
                case "ola":
                    answer = (100 * (numberArgs[0] / (numberArgs[1] / 2))).toFixed(2);
                    break;
                case "average":
                    let average = numberArgs.slice(0, numberArgs.length).map(arg => Number(arg));
                    let plus = average.reduce(function (total, num) {
                        return total + num;
                    });
                    answer = plus / average.length;
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, calculation function specified invalid.",
                        desc: `This command supports the following functions:
                        - Handling comparables (\`compare\`)
                        - Handling calculation (\`handling\`)
                        - Skidpad value estimation (\`handlingest\`)
                        - MRA and OLA calculation (\`mra\` & \`ola\` respectively)
                        - Averaging values (\`average\`)
                        More on them can be found by running \`cd-help calculate\`.`,
                        author: message.author
                    }).displayClosest(calcFunction);
                    return errorMessage.sendMessage();
            }

            const resultMessage = new SuccessMessage({
                channel: message.channel,
                title: "Calculation successful!",
                desc: `Result: **${answer.toLocaleString("en")}**`,
                author: message.author,
            });
            return resultMessage.sendMessage();
        }
    }
};

/**
 * cd-calc compare — where do cars like this sit for handling?
 * Takes a car name / -carID (live car, BM resolves to its base) or a pasted
 * cd-submit car block (handling optional). Never returns a single number.
 */
async function compareHandling(message, args) {
    const content = message.content || "";
    const at = content.toLowerCase().indexOf(args[0].toLowerCase());
    const raw = (at >= 0 ? content.slice(at + args[0].length) : args.slice(1).join(" ")).trim();
    if (!raw) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Tell me which car.",
            desc: "`cd-calc compare <car name>` or `cd-calc compare -c01234`, or paste a `cd-submit car` block after it (the handling line may be left out).",
            author: message.author
        }).sendMessage();
    }

    const looksLikePaste = /\n/.test(raw) && /(^|\n)\s*[a-z0-9 \-]+\s*:/i.test(raw);
    if (looksLikePaste) {
        const parsed = parseCarSubmissionText(raw);
        const entry = parsed.cars[0];
        if (!entry) {
            return new ErrorMessage({
                channel: message.channel,
                title: "I couldn't read that block.",
                desc: "Paste it in the `cd-submit car` format — `key: value` lines, one per line.",
                author: message.author
            }).sendMessage();
        }
        const report = validateCarSubmission(entry.fields, { isAdmin: false, unknownKeys: entry.unknownKeys, optionalFields: COMPARE_OPTIONAL });
        if (!report.ok) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Fix these before I can compare it.",
                desc: report.blockers.map(blocker => `• ${blocker.message}`).join("\n").slice(0, 4000),
                author: message.author
            }).sendMessage();
        }
        return sendComparables(message, report.car, null);
    }

    const carFiles = getCarFiles();
    let query = raw.toLowerCase().split(/\s+/), searchBy = "carWithBM";
    if (query[0].startsWith("-c")) {
        query = [query[0].slice(1)];
        searchBy = "id";
    }
    const response = await search(message, query, carFiles, searchBy);
    if (!Array.isArray(response)) return;
    const [carFile, currentMessage] = response;
    const currentCar = getCar(carFile);
    const base = modifiedBase(currentCar);
    return sendComparables(message, { ...base, carID: base.carID || carFile.slice(0, 6) }, currentMessage);
}

function sendComparables(message, car, currentMessage) {
    const result = findComparables(car, { excludeID: car.carID });
    if (!result.band) {
        return new ErrorMessage({
            channel: message.channel,
            title: `No comparable cars on ${car.tyreType} tyres.`,
            desc: "The pool for that tyre type is empty after excluding novelty cards.",
            author: message.author
        }).sendMessage({ currentMessage });
    }

    const lines = list => list.map(formatLine).join("\n") || "—";
    const { band, brandBand, lineCheck } = result;

    // ── where cars like it sit ──
    const where = [];
    if (brandBand) where.push(`Same brand: **${brandBand.min}–${brandBand.max}**, median **${brandBand.median}** (${brandBand.count} cars).`);
    where.push(`Closest overall: **${band.min}–${band.max}**, median **${band.median}** (${result.tightness} match).`);

    // ── model-line check: trims only. Straight-line stats do not bound
    //    cornering, so there is no class-wide floor or ceiling on purpose ──
    const lineNotes = [];
    const describeInversion = inv => `${inv.higher.name} is rated **${inv.higher.handling}** although ${inv.stronger.name} (**${inv.stronger.handling}**) beats it on every stat`;
    for (const inv of lineCheck.own) lineNotes.push(`⚠ This car: ${describeInversion(inv)}.`);
    for (const inv of lineCheck.others) lineNotes.push(`Elsewhere in the line: ${describeInversion(inv)}.`);
    if (lineNotes.length) lineNotes.push("An inversion is fine when the higher car carries something the stats miss (aero, wider tyres); otherwise one of the two is off.");
    else if (lineCheck.checked) lineNotes.push(`No trim in this model line is rated above a trim that out-specs it (${lineCheck.checked} checked).`);

    const desc = [
        "**Not a verdict.** Handling is hand-rated and the roster is not perfectly consistent, so treat everything below as evidence to argue with, not a number to copy.",
        `Same tyres (**${result.tyreType}**), matched on year, weight, 0-60, top speed, clearance, MRA/OLA, body, engine position, drive and brand — ${result.poolSize.toLocaleString("en")} cars in the pool.`,
        typeof car.handling === "number"
            ? `Currently **${car.handling}** — ${result.position} the band of its closest cars.`
            : "No handling given — this is where cars like it sit."
    ].join("\n");

    const fields = [{ name: "Where cars like it sit", value: where.join("\n") }];
    if (lineNotes.length) fields.push({ name: "Model line check (trims only)", value: lineNotes.join("\n").slice(0, 1024) });
    if (result.brand.length) fields.push({ name: "Same brand, closest first", value: lines(result.brand) });
    fields.push({ name: "Closest overall", value: lines(result.neighbours) });
    if (result.family.length) fields.push({ name: "Same model line", value: lines(result.family) });

    return new InfoMessage({
        channel: message.channel,
        title: `Handling comparables — ${result.name}`,
        desc,
        author: message.author,
        fields,
        footer: "Pick where it belongs and say why."
    }).sendMessage({ currentMessage });
}
