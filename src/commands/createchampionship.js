"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getCarFiles, getTrackFiles, getCar, getTrack, getPack, getDriver, getAllChampionshipTemplates } = require("../util/functions/dataManager.js");
const sortCars = require("../util/functions/sortCars.js");
const { getAvailableTunes } = require("../util/functions/calcTune.js");

const carFiles = getCarFiles();
const tracks = getTrackFiles();
const championshipModel = require("../models/championshipsSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

/**
 * Validate one template round. Returns an error string or null.
 * Every ID must resolve NOW — a chapter authored weeks ago can reference a car
 * that has since been renamed or archived, and that must surface at create
 * time, not as a broken round mid-story.
 */
function validateTemplateRound(round, index, validTunes) {
    const label = `Round ${index + 1}`;
    if (!round || typeof round !== "object") return `${label}: not an object.`;
    if (!round.carID || !getCar(round.carID)) return `${label}: opponent car \`${round.carID}\` not found.`;
    if (!round.track || !getTrack(round.track)) return `${label}: track \`${round.track}\` not found.`;
    if (!validTunes.includes(String(round.upgrade))) return `${label}: upgrade \`${round.upgrade}\` invalid (${validTunes.join("/")}).`;
    if (round.reqs !== undefined && (typeof round.reqs !== "object" || Array.isArray(round.reqs))) return `${label}: \`reqs\` must be an object.`;
    const rewards = round.rewards || {};
    if (typeof rewards !== "object" || Array.isArray(rewards)) return `${label}: \`rewards\` must be an object.`;
    const rewardKeys = Object.keys(rewards);
    if (rewardKeys.length > 3) return `${label}: more than 3 reward types.`;
    for (const key of rewardKeys) {
        const value = rewards[key];
        switch (key) {
            case "money":
            case "fuseTokens":
            case "trophies":
                if (typeof value !== "number" || value < 1) return `${label}: \`${key}\` must be a positive number.`;
                break;
            case "car":
                if (!value || !getCar(value.carID)) return `${label}: reward car \`${value && value.carID}\` not found.`;
                if (!validTunes.includes(String(value.upgrade || "000"))) return `${label}: reward car upgrade invalid.`;
                break;
            case "pack":
                if (!getPack(value)) return `${label}: reward pack \`${value}\` not found.`;
                break;
            case "driver":
                if (!getDriver(value)) return `${label}: reward driver \`${value}\` not found.`;
                break;
            default:
                return `${label}: unknown reward type \`${key}\` (money/fuseTokens/trophies/car/pack/driver).`;
        }
    }
    return null;
}

module.exports = {
    name: "createchampionship",
    aliases: ["newchampionship"],
    usage: ["<number of rounds> <championship name>", "template <template name>"],
    args: 2,
    category: "Admin",
    description: "Creates a championship with the name of your choice, or a pre-built chapter from a template in src/championships/.",
    async execute(message, args) {
        const championships = await championshipModel.find();
        const { totalChampionships } = await serverStatModel.findOne({});

        // ── Pre-built chapter: createchampionship template <name or chXXXXX> ──
        if (args[0].toLowerCase() === "template") {
            const query = args.slice(1).join(" ").toLowerCase();
            const templates = getAllChampionshipTemplates();
            const template = templates.find(t => t.templateID.toLowerCase() === query)
                || templates.find(t => (t.name || "").toLowerCase() === query)
                || templates.find(t => (t.name || "").toLowerCase().includes(query));
            if (!template) {
                const list = templates.length
                    ? templates.map(t => `\`${t.templateID}\` — ${t.name || "(unnamed)"} (${(t.roster || []).length} rounds)`).join("\n")
                    : "*none loaded — add `chXXXXX.json` files to `src/championships/` and restart*";
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, championship template not found.",
                    desc: `Available templates:\n${list}`,
                    author: message.author
                }).displayClosest(query);
                return errorMessage.sendMessage();
            }

            const templateName = template.name || template.templateID;
            if (championships.find(champ => champ.name === templateName) !== undefined) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, championship name already taken.",
                    desc: "A championship with this template's name already exists — end it first or rename the template.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
            if (!Array.isArray(template.roster) || template.roster.length < 1 || template.roster.length > 100) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, template roster invalid.",
                    desc: "A template needs a `roster` array of 1 ~ 100 rounds.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            // Validate EVERY round before creating anything — all-or-nothing.
            const validTunes = getAvailableTunes();
            const problems = [];
            template.roster.forEach((round, i) => {
                const problem = validateTemplateRound(round, i, validTunes);
                if (problem) problems.push(problem);
            });
            if (problems.length > 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: `Error, template failed validation (${problems.length} problem(s)).`,
                    desc: problems.slice(0, 10).join("\n") + (problems.length > 10 ? `\n… and ${problems.length - 10} more` : ""),
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            const roster = template.roster.map(round => ({
                carID: round.carID.slice(0, 6),
                upgrade: String(round.upgrade),
                track: round.track.slice(0, 6),
                reqs: round.reqs || {},
                rewards: round.rewards || {}
            }));
            const newDoc = {
                championshipID: `champ${totalChampionships + 1}`,
                name: templateName,
                roster
            };
            // Duration stays relative ("14d") until startchampionship converts it,
            // so a pre-built chapter never burns its timer while staged.
            if (template.duration !== undefined && template.duration !== "unlimited") {
                const days = parseInt(template.duration);
                if (isNaN(days) || days < 1) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, template duration invalid.",
                        desc: "`duration` must be a number of days (e.g. `14` or `\"14d\"`) or `\"unlimited\"`.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
                newDoc.deadline = `${days}d`;
            }
            if (template.isVIP === true) newDoc.isVIP = true;

            await championshipModel.create(newDoc);
            await serverStatModel.updateOne({}, { "$inc": { totalChampionships: 1 } });

            const rewardRounds = roster.filter(round => Object.keys(round.rewards).length > 0).length;
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully created "${templateName}" from template ${template.templateID}!`,
                desc: `Rounds: **${roster.length}** (${rewardRounds} with rewards)${newDoc.deadline ? `\nDuration: **${newDoc.deadline}** (timer starts at launch)` : ""}\n\nIt stays hidden from players until \`cd-startchampionship\`. Tweak anything with \`cd-editchampionship\`.`,
                author: message.author
            });
            return successMessage.sendMessage();
        }

        const championshipName = args.splice(1, args.length).join(" ");
        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 100) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, round amount provided is either not a number or not supported.",
                desc: "The number of rounds in a championship is restricted to 1 ~ 100 rounds.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }
        if (championships.find(champ => champ.name === championshipName) !== undefined) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, championship name already taken.",
                esc: "Check the list of championships using the command `cd-championships`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const rounds = parseInt(args[0]);
        let opponentIDs = [];
        for (let i = 0; i < rounds; i++) {
            opponentIDs[i] = carFiles[Math.floor(Math.random() * carFiles.length)].slice(0, 6);
        }

        opponentIDs = sortCars(opponentIDs, "cr", "ascending");
        const roster = [], upgrades = getAvailableTunes();
        for (let opponent of opponentIDs) {
            roster.push({
                carID: opponent,
                upgrade: upgrades[Math.floor(Math.random() * upgrades.length)],
                track: tracks[Math.floor(Math.random() * tracks.length)].slice(0, 6),
                reqs: {},
                rewards: {}
            });
        }
        await championshipModel.create({
            championshipID: `champ${totalChampionships + 1}`,
            name: championshipName,
            roster
        });
        await serverStatModel.updateOne({}, { "$inc": { totalChampionships: 1 } });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new championship named ${championshipName}!`,
            desc: "You can now apply changes to the championship using `cd-editchampionship`.",
            author: message.author
        });
        return successMessage.sendMessage();
    }
};
// Exposed for the template test harness — the command loader only reads `name`.
module.exports._internals = { validateTemplateRound };
