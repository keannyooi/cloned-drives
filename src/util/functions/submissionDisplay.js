"use strict";

/**
 * SUBMISSION DISPLAY HELPERS
 * ==========================
 * One place for the strings that must read identically in the creator's
 * preview, the reviewer's card and the archive-channel post.
 *
 * The name format mirrors cd-carinfo (carinfo.js:77 → carNameGen with
 * `rarity: true`, which builds it at carNameGen.js:29):
 *
 *     (<rarity emoji> <CR>) Make Model
 *
 * A BM card has no stats of its own — it inherits them from the reference
 * car — so the CR shown is the REFERENCE car's. That's the number that should
 * be printed on the submitted art, which makes a mismatch obvious.
 */

const rarityCheck = require("./rarityCheck.js");

/**
 * "(<rarity> <CR>)" for a reference car, or "" when there isn't one.
 *
 * rarityCheck reads bot.emojis.cache, which is empty until the gateway is up
 * and can miss an emote the bot has lost access to. Falling back to "(852)"
 * keeps the CR — the part that actually matters — instead of printing
 * "(undefined 852)".
 */
function crTag(referenceCar) {
    if (!referenceCar) return "";
    const emoji = rarityCheck(referenceCar, "bm");
    return emoji ? `(${emoji} ${referenceCar.cr})` : `(${referenceCar.cr})`;
}

/**
 * Full display name: "(<rarity> <CR>) Make Model".
 * @param {Object} submission - anything carrying `make` (array or string) and `model`
 * @param {Object|null} referenceCar - the resolved base car
 */
function crName(submission, referenceCar) {
    const make = Array.isArray(submission.make) ? submission.make : [submission.make];
    const plain = [...make.filter(Boolean), submission.model].join(" ").trim() || "Untitled";
    const tag = crTag(referenceCar);
    return tag ? `${tag} ${plain}` : plain;
}

/**
 * "(<rarity> <CR>) Name" for a STAGED car, which isn't a loaded car object —
 * it's a parsed carfile with just a cr number. Same visual language as
 * cd-carinfo so a reviewer reads submissions and cars the same way.
 */
function stagingCrName(staged) {
    if (!staged) return "?";
    if (typeof staged.cr !== "number") return staged.name || "?";
    // rarityCheck only needs cr and a type it can resolve.
    const emoji = rarityCheck({ cr: staged.cr, cardType: ["Normal"] });
    return emoji ? `(${emoji} ${staged.cr}) ${staged.name}` : `(${staged.cr}) ${staged.name}`;
}

/**
 * The archive-channel caption: ID, CR + name, and what it's based on.
 *   `SBM000001` — (<rarity> 849) Porsche 911 GT2 Vorse — based on `c01073`
 */
function archiveLabel(submissionID, submission, referenceCar) {
    const bits = [`\`${submissionID}\``, crName(submission, referenceCar)];
    if (referenceCar) bits.push(`based on \`${submission.reference}\``);
    else if (submission.referenceName) bits.push(`based on *${submission.referenceName}* (not in game)`);
    return bits.join(" — ");
}

module.exports = { crTag, crName, stagingCrName, archiveLabel };
