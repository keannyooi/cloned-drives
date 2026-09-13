"use strict";

/**
 * SUGGEST EDIT
 * ============
 * Anyone can propose a correction to a live car from the **Suggest edit**
 * button under cd-carinfo: one modal (a dropdown for the kind of edit, the
 * proposed value, an optional source), filed as a submission of type "edit"
 * with IDs SED1, SED2 … — the same store, feed and review verbs as every
 * other submission. Approving a power suggestion writes the value
 * into the carfile in place (carfilePatch.js) and reloads the car; a
 * description or "other" correction is a ticket the reviewer applies by hand
 * (`cd-review approve SEDx apply` writes a description straight in).
 * Design: docs/race-engine-rework.md §9.2.
 *
 * Rules: no role gate, but accounts under RULES.minAccountDays are refused,
 * a person may file RULES.maxPerHour suggestions an hour (a burst limit, not a
 * cap — someone who knows thirty real figures is welcome), a second
 * suggestion on the same field of the same car joins the open one as a +1
 * instead of duplicating it, and anything untouched for RULES.staleDays is
 * closed by the daily sweep.
 */

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, LabelBuilder,
    StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require("discord.js");
const { DateTime } = require("luxon");
const bot = require("../../config/config.js");
const submissionModel = require("../../models/submissionSchema.js");
const { createSubmission, updateSubmission } = require("./submissionStore.js");
const { feed, notifyCreator } = require("./submissionViews.js");
const { editCurrentValue } = require("./submissionDisplay.js");
const { getCar, reloadCar } = require("./dataManager.js");
const { modifiedBase } = require("./cardType.js");
const { patchCarfile } = require("./carfilePatch.js");
const carNameGen = require("./carNameGen.js");

const RULES = {
    maxPerHour: 20,
    minAccountDays: 7,
    staleDays: 30,
    modalTimeout: 10 * 60 * 1000,      // how long the form may sit open
    buttonLifetime: 3 * 60 * 1000      // how long the button under a cd-cinfo stays live
};

const KINDS = {
    power: { label: "Power", blurb: "Engine output — PS, hp or kW (say which)", unit: "PS", applies: true },
    description: { label: "Description", blurb: "A better blurb — paste the whole new text", unit: "", applies: false },
    other: { label: "Other correction", blurb: "Any other field — say which, and what it should be", unit: "", applies: false }
};
const BUTTON_PREFIX = "suggestEdit";

const nameOf = car => carNameGen({ currentCar: car, removePrizeTag: true });

// ─── the form ────────────────────────────────────────────────────────────────

/** The button row that sits under a cd-carinfo embed. */
function suggestButtonRow(carID) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:${carID}`).setLabel("Suggest edit").setEmoji("✏️").setStyle(ButtonStyle.Secondary)
    );
}

function buildModal(customId, car) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(`Suggest an edit — ${nameOf(car)}`.slice(0, 45))
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("What kind of edit?")
                .setStringSelectMenuComponent(new StringSelectMenuBuilder()
                    .setCustomId("kind").setPlaceholder("Pick one").setMinValues(1).setMaxValues(1)
                    .setOptions(Object.entries(KINDS).map(([value, kind]) => ({ label: kind.label, value, description: kind.blurb })))),
            new LabelBuilder()
                .setLabel("Your proposed value")
                .setDescription("Power: number + unit — 450 PS, 450 hp or 336 kW. Description: the whole new text.")
                .setTextInputComponent(new TextInputBuilder()
                    .setCustomId("value").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
                    .setPlaceholder("450 PS")),
            new LabelBuilder()
                .setLabel("Source")
                .setDescription("Where it comes from — a link, a press kit, a book. Optional, but it speeds up review.")
                .setTextInputComponent(new TextInputBuilder()
                    .setCustomId("source").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200))
        );
}

// ─── reading a proposal ──────────────────────────────────────────────────────

/** "1,450" → 1450 · "3,2" → 3.2 · "450.5" → 450.5 */
function numberIn(text) {
    const match = String(text).match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    let digits = match[0];
    digits = /^-?\d+,\d{1,2}$/.test(digits) ? digits.replace(",", ".") : digits.replace(/,/g, "");
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
}

/**
 * Turn what was typed into what would be stored. Numbers are converted to the
 * game's unit; text is trimmed and bounded.
 * @returns {{ ok: true, value: string, number?: number, note?: string } | { ok: false, error: string }}
 */
function normaliseProposal(kind, raw, car) {
    const text = String(raw || "").trim();
    if (!KINDS[kind]) return { ok: false, error: "Pick what kind of edit it is." };
    if (!text) return { ok: false, error: "The proposed value is empty." };

    if (kind === "power") {
        const number = numberIn(text);
        if (number === null) return { ok: false, error: "Power needs a number — `450 hp`, `340 kW` or `456 PS`. (Fuel type is a different field: pick *Other correction*.)" };
        let ps = number, note = null;
        // The unit may sit right against the number ("450hp") or after a space ("450 hp").
        if (/\d\s*kw\b|kilowatt/i.test(text)) { ps = number * 1.35962; note = `${number} kW → PS`; }
        else if (/\d\s*(b|w)?hp\b|horsepower/i.test(text)) { ps = number * 1.01387; note = `${number} hp → PS`; }
        // No guessing: a bare number could be either, and hp and PS differ by 1.4%.
        else if (!/\d\s*(ps|cv|pk)\b/i.test(text)) return { ok: false, error: "Say the unit — `450 PS`, `450 hp` or `336 kW`. The game stores PS, so hp and kW are converted." };
        ps = Math.round(ps);
        if (ps < 1 || ps > 5000) return { ok: false, error: `${ps} PS isn't a car. 1 to 5000.` };
        return { ok: true, value: `${ps} PS`, number: ps, note };
    }
    if (kind === "description") {
        const clean = text.replace(/\s+/g, " ");
        if (clean.length < 10) return { ok: false, error: "That's too short for a description — paste the whole new text." };
        if (clean.length > 1000) return { ok: false, error: "Descriptions are capped at 1000 characters." };
        if (car && clean === String(car.description || "").replace(/\s+/g, " ")) return { ok: false, error: "That's the description it already has." };
        return { ok: true, value: clean };
    }
    if (text.length < 5) return { ok: false, error: "Say which field and what it should be — e.g. `body style: Wagon`." };
    return { ok: true, value: text.slice(0, 1000) };
}

// ─── filing ──────────────────────────────────────────────────────────────────

/**
 * Save a suggestion, or attach it to the open one on the same field.
 * @returns {Promise<{ ok: true, submission, attached: boolean, proposal } | { ok: false, error: string }>}
 */
async function fileSuggestion({ user, carID, car, kind, raw, source }) {
    const ageDays = (Date.now() - user.createdTimestamp) / 86400000;
    if (ageDays < RULES.minAccountDays) return { ok: false, error: `Accounts need to be ${RULES.minAccountDays} days old to suggest edits.` };

    const base = modifiedBase(car) || car;
    const proposal = normaliseProposal(kind, raw, base);
    if (!proposal.ok) return proposal;
    const cleanSource = String(source || "").trim().slice(0, 200);
    const isDev = bot.devMode === true;
    const now = DateTime.utc().toISO();
    // A BM card has no stats of its own: a power figure belongs to
    // the base car it reads from. Its description and anything else are its own.
    const statsCar = kind === "power" && base.carID && base.carID !== carID ? base : car;
    const targetID = statsCar.carID || carID;

    // One open thread per car field: a second voice joins it as a +1.
    const targetKey = kind === "other" ? `${targetID}|other|${Date.now()}` : `${targetID}|${kind}`;
    if (kind !== "other") {
        const open = await submissionModel.findOne({ type: "edit", targetKey, status: "pending", isDev });
        if (open) {
            const already = open.creatorID === user.id || (open.supporters || []).some(entry => entry.userID === user.id);
            if (already) return { ok: false, error: `You already have \`${open.submissionID}\` open on this — it proposes ${open.proposedValue}.` };
            const supporters = [...(open.supporters || []), { userID: user.id, tag: user.username, note: proposal.value, source: cleanSource, at: now }];
            const updated = await updateSubmission(open.submissionID, { supporters });
            void feed("attached", updated, { who: user.username, detail: proposal.value !== open.proposedValue ? `they say ${proposal.value}` : "" });
            return { ok: true, submission: updated, attached: true, proposal };
        }
    }

    const hourAgo = DateTime.utc().minus({ hours: 1 }).toISO();
    const recent = await submissionModel.countDocuments({ type: "edit", creatorID: user.id, isDev, createdAt: { "$gte": hourAgo } });
    if (recent >= RULES.maxPerHour) {
        return { ok: false, error: `That's ${recent} suggestions in the last hour — the limit is ${RULES.maxPerHour}. Give it a little while and carry on.` };
    }

    const submission = await createSubmission({
        type: "edit",
        creatorID: user.id,
        creatorTag: user.username,
        reference: targetID,
        targetKey,
        targetName: nameOf(statsCar),
        field: kind,
        proposedValue: proposal.value,
        proposedRaw: String(raw || "").trim().slice(0, 1000),
        currentValue: editCurrentValue(base, kind),
        sourceUrl: cleanSource,
        make: Array.isArray(car.make) ? car.make : [car.make],
        model: car.model,
        modelYear: car.modelYear,
        country: car.country || ""
    });
    void feed("suggested", submission);
    return { ok: true, submission, attached: false, proposal };
}

/** Button → modal → filed. One click's whole journey; never throws. */
async function openSuggestFlow(interaction, carID, car) {
    const customId = `suggest:${carID}:${interaction.id}`;
    try {
        await interaction.showModal(buildModal(customId, car));
    }
    catch (error) {
        console.log(`[SuggestEdit] modal failed for ${carID}: ${error.message}`);
        return;
    }
    const submitted = await interaction.awaitModalSubmit({
        filter: modal => modal.customId === customId && modal.user.id === interaction.user.id,
        time: RULES.modalTimeout
    }).catch(() => null);
    if (!submitted) return;

    const kind = (submitted.fields.getStringSelectValues("kind") || [])[0];
    const raw = submitted.fields.getTextInputValue("value");
    let source = "";
    try { source = submitted.fields.getTextInputValue("source"); } catch (error) { source = ""; }

    let result;
    try {
        result = await fileSuggestion({ user: submitted.user, carID, car, kind, raw, source });
    }
    catch (error) {
        console.log(`[SuggestEdit] filing failed for ${carID}: ${error.stack}`);
        result = { ok: false, error: `Something went wrong saving it (\`${error.message}\`). Please try again.` };
    }

    let content;
    if (!result.ok) content = `❌ ${result.error}`;
    else if (result.attached) {
        content = `👍 Added your +1 to \`${result.submission.submissionID}\`, which already proposes **${result.submission.proposedValue}** for the ${kind} of **${nameOf(car)}**.`
            + (result.proposal.value !== result.submission.proposedValue ? ` Your figure (${result.proposal.value}) is noted on it.` : "");
    }
    else {
        const { submission, proposal } = result;
        content = `✅ Filed as \`${submission.submissionID}\` — **${KINDS[kind].label.toLowerCase()}** on **${nameOf(car)}**: `
            + (kind === "power"
                ? `**${proposal.value}**${proposal.note ? ` (${proposal.note})` : ""}${submission.currentValue && submission.currentValue !== "—" ? `, currently ${submission.currentValue}` : ""}.`
                : "noted.")
            + "\nA reviewer will look at it; you'll get a DM when it's decided.";
    }
    await submitted.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

/**
 * Keep the Suggest edit button under a cd-carinfo embed live for a while.
 * Anyone may click it; each click runs its own modal. The row is removed
 * when the collector ends so an old message never shows a dead button.
 * @param {Object} botMessage  the InfoMessage after sendMessage (has .message and .removeButtons)
 */
function watchSuggestButton(botMessage, carID, car) {
    const message = botMessage && botMessage.message;
    if (!message || typeof message.createMessageComponentCollector !== "function") return null;
    const collector = message.createMessageComponentCollector({
        filter: interaction => interaction.customId === `${BUTTON_PREFIX}:${carID}`,
        time: RULES.buttonLifetime
    });
    collector.on("collect", interaction => {
        openSuggestFlow(interaction, carID, car).catch(error => console.log(`[SuggestEdit] flow failed: ${error.stack}`));
    });
    collector.on("end", () => {
        if (typeof botMessage.removeButtons === "function") botMessage.removeButtons().catch(() => {});
    });
    return collector;
}

// ─── review side ─────────────────────────────────────────────────────────────

/** Numbers as the carfile stores them. */
function storedNumber(kind, proposedValue) {
    const number = numberIn(proposedValue);
    return number === null ? null : Math.round(number);
}

/**
 * Apply an approved suggestion to its carfile. Power is always written; a
 * description only with `apply`; "other" never (the reviewer
 * edits by hand). Reloads the car so the game sees it at once.
 * @returns {Promise<{ applied: boolean, key?: string, from?, to?, text?: string, path?: string, why?: string }>}
 */
async function applySuggestion(submission, { by, apply = false, dir } = {}) {
    const kind = submission.field;
    const carID = submission.reference;
    if (!KINDS[kind]) return { applied: false, why: "unknown kind of edit" };
    if (kind === "other") return { applied: false, why: "an 'other' correction is applied by hand" };
    if (kind === "description" && !apply) return { applied: false, why: "add `apply` to write the description into the carfile" };

    const car = getCar(carID);
    if (!car) throw new Error(`${carID} is not a loaded car`);
    const ops = { set: {}, remove: [], log: { at: DateTime.utc().toISO(), by, field: kind, via: submission.submissionID } };
    let from, to;
    if (kind === "description") {
        from = car.description || "";
        to = submission.proposedValue;
        ops.set.description = to;
    }
    else {
        to = storedNumber(kind, submission.proposedValue);
        if (to === null) throw new Error(`no number in "${submission.proposedValue}"`);
        from = typeof car[kind] === "number" ? car[kind] : null;
        ops.set[kind] = to;
        if (kind === "power") ops.remove.push("powerEstimated");    // a person confirmed it
    }
    ops.log.from = kind === "description" ? from.slice(0, 120) : from;
    ops.log.to = kind === "description" ? to.slice(0, 120) : to;

    const result = patchCarfile(carID, ops, { dir });
    if (!dir) reloadCar(carID);
    return { applied: true, key: kind, from, to, text: result.text, path: result.path };
}

/** Tell everyone on a suggestion (the suggester and the +1s) what happened. */
async function notifyEveryone(submission, title, body) {
    const plain = typeof submission.toObject === "function" ? submission.toObject() : submission;
    const reached = await notifyCreator(plain, title, body);
    for (const supporter of plain.supporters || []) {
        if (!supporter.userID || supporter.userID === plain.creatorID) continue;
        await notifyCreator({ ...plain, creatorID: supporter.userID }, title, body).catch(() => {});
    }
    return reached;
}

/**
 * Daily: close suggestions nobody has looked at for RULES.staleDays.
 * @returns {Promise<{ checked: number, closed: number }>}
 */
async function closeStaleSuggestions(now = DateTime.utc()) {
    const pending = await submissionModel.find({ type: "edit", status: "pending", isDev: bot.devMode === true });
    const tally = { checked: pending.length, closed: 0 };
    for (const submission of pending) {
        const since = DateTime.fromISO(submission.submittedAt || submission.createdAt || "");
        if (!since.isValid || now.diff(since, "days").days < RULES.staleDays) continue;
        const updated = await updateSubmission(submission.submissionID, {
            status: "expired",
            reviewNote: `Closed automatically after ${RULES.staleDays} days without a review decision.`
        });
        tally.closed++;
        void feed("expired", updated);
    }
    return tally;
}

module.exports = {
    RULES, KINDS, BUTTON_PREFIX,
    suggestButtonRow, buildModal, watchSuggestButton, openSuggestFlow,
    normaliseProposal, fileSuggestion, applySuggestion, notifyEveryone, closeStaleSuggestions
};
