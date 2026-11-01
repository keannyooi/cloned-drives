"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, moneyEmojiID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const confirm = require("../util/functions/confirm.js");
const auditLog = require("../util/functions/auditLog.js");
const { getProfile } = require("../util/functions/profileCache.js");
const { LIST_LIMIT, listOpen, openCounts, formatTimeLeft, checkAction, describeRefusal, refusalTitle, undoAction } = require("../util/functions/undoActions.js");

module.exports = {
    name: "undo",
    aliases: ["ud", "revert"],
    usage: [
        "              — undo your latest cd-sell or cd-upgrade",
        "list [page]   — see everything you can still undo",
        "<number>      — undo that entry from the list"
    ],
    args: 0,
    category: "Gameplay",
    description: "Reverses a cd-sell or cd-upgrade within 2 hours. A sale needs the money back, and an upgrade can't be undone once you have raced that car.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const sub = args[0]?.toLowerCase();
        if (sub && sub !== "list" && !/^\d+$/.test(sub)) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, I don't understand that.",
                desc: "Use `cd-undo`, `cd-undo list` or `cd-undo <number>`.",
                author: message.author
            }).sendMessage();
        }

        const [playerData, counts] = await Promise.all([getProfile(message.author.id), openCounts(message.author.id)]);
        if (counts.live === 0) {
            return new InfoMessage({
                channel: message.channel,
                title: "You have nothing to undo.",
                desc: counts.raced > 0
                    ? "You have raced the car(s) you upgraded since, so those upgrades can't be undone. Test races count too."
                    : "A sale or upgrade can be undone for 2 hours after you make it.",
                author: message.author
            }).sendMessage();
        }
        const racedNote = counts.raced > 0 ? `\n\n_${counts.raced.toLocaleString("en")} upgrade(s) aren't shown, because you have raced those cars since._` : "";

        if (sub === "list") {
            const now = Date.now();
            const pages = Math.ceil(counts.live / LIST_LIMIT);
            const page = Math.min(Math.max(parseInt(args[1], 10) || 1, 1), pages);
            const skip = (page - 1) * LIST_LIMIT;
            const rows = await listOpen(message.author.id, { skip });
            const lines = rows.map((row, i) => `**${skip + i + 1}.** ${row.summary} — ${formatTimeLeft(new Date(row.expiresAt).getTime() - now)} left`);
            return new InfoMessage({
                channel: message.channel,
                title: `Things you can undo${pages > 1 ? ` (page ${page} of ${pages})` : ""}`,
                desc: `${lines.join("\n")}\n\nUse \`cd-undo <number>\` to pick one.${pages > 1 ? " Use `cd-undo list <page>` to see more." : ""}${racedNote}`,
                author: message.author
            }).sendMessage();
        }

        // Past the end is a plain "no such number", and keeps a huge number out of the query.
        const number = sub ? parseInt(sub, 10) : 1;
        const [action] = number >= 1 && number <= counts.live ? await listOpen(message.author.id, { skip: number - 1, limit: 1 }) : [];
        if (!action) {
            return new ErrorMessage({
                channel: message.channel,
                title: `Error, there is no number ${sub ?? 1} on your list.`,
                desc: "Use `cd-undo list` to see what you can undo.",
                author: message.author
            }).sendMessage();
        }

        // Most actions are on the player's own garage; cd-changetune isn't.
        const target = action.targetID === message.author.id ? playerData : await getProfile(action.targetID);
        const refusal = checkAction(action, target);
        if (refusal) {
            return new ErrorMessage({
                channel: message.channel,
                title: refusalTitle(refusal),
                desc: `${action.summary}\n\n${describeRefusal(refusal, moneyEmoji)}${counts.live > 1 ? "\n\nUse `cd-undo list` to see what else you can undo." : ""}`,
                author: message.author
            }).sendMessage();
        }

        const skipped = !sub && counts.raced > 0
            ? "\n\n_Upgrades you have raced with can't be undone, so this is the latest one that can._"
            : "";
        const confirmationMessage = new InfoMessage({
            channel: message.channel,
            title: "Are you sure you want to undo this?",
            desc: `${action.summary}\n\n${whatHappens(action, target, moneyEmoji)}${skipped}\n\nYou have been given ${defaultChoiceTime / 1000} seconds to consider.`,
            author: message.author
        });

        await confirm(message, confirmationMessage, async (currentMessage) => {
            // A big sale takes a few seconds; show the click landed.
            confirmationMessage.editEmbed({ title: "Working on it...", desc: action.summary });
            await confirmationMessage.sendMessage({ currentMessage, preserve: true });

            const result = await undoAction({ actionID: action._id, actorID: message.author.id });
            if (!result.ok) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: refusalTitle(result),
                    desc: describeRefusal(result, moneyEmoji),
                    author: message.author
                }).sendMessage({ currentMessage });
            }
            // cd-changetune is always audited, so its undo is too, even on the admin's own garage.
            if (result.action.kind === "changetune") {
                auditLog(message, {
                    command: "undo",
                    target: { id: result.action.targetID, username: result.action.targetName },
                    details: { kind: result.action.kind, carID: result.action.carID, from: result.action.to, to: result.action.from }
                });
            }

            const hasBalance = result.action.targetID === message.author.id && typeof result.balance === "number";
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Undone!",
                desc: whatHappened(result.action, moneyEmoji),
                author: message.author,
                fields: hasBalance ? [{ name: "Your Money Balance", value: `${moneyEmoji}${result.balance.toLocaleString("en")}` }] : []
            });
            await successMessage.sendMessage({ currentMessage });
            return successMessage.removeButtons();
        }, playerData.settings.buttonstyle);
    }
};

/** The preview: what the player gets and what it costs. */
function whatHappens(action, target, moneyEmoji) {
    const money = amount => `${moneyEmoji}${amount.toLocaleString("en")}`;
    if (action.kind === "sell") {
        // listOpen reads just the largest few cars of a sale.
        const lines = action.cars.map(({ carID, tune, n }) => {
            const car = getCar(carID);
            return `• **${n.toLocaleString("en")}×** ${car ? carNameGen({ currentCar: car, rarity: true, upgrade: tune }) : carID}`;
        });
        const more = action.modelCount > lines.length
            ? `\n_…and ${(action.modelCount - lines.length).toLocaleString("en")} more model(s)_`
            : "";
        return `**${action.carCount.toLocaleString("en")} car(s)** go back to your garage, and you pay back **${money(action.money)}**. That leaves you with ${money(target.money - action.money)}.\n\n${lines.join("\n")}${more}`;
    }
    const carData = getCar(action.carID);
    const name = carData ? carNameGen({ currentCar: carData }) : action.carID;
    if (action.kind === "upgrade") {
        return `Your ${name} goes back from \`${action.to}\` to \`${action.from}\`, and you get back **${money(action.money)}**.`;
    }
    return `${action.targetName}'s ${name} goes back from \`${action.to}\` to \`${action.from}\`.`;
}

/** The result: what the player has now, not what they first did. */
function whatHappened(action, moneyEmoji) {
    const money = `${moneyEmoji}${action.money.toLocaleString("en")}`;
    if (action.kind === "sell") {
        return `**${action.carCount.toLocaleString("en")} car(s)** are back in your garage, and you paid back **${money}**.`;
    }
    const carData = getCar(action.carID);
    const name = carData ? carNameGen({ currentCar: carData }) : action.carID;
    if (action.kind === "upgrade") {
        return `Your ${name} is back at \`${action.from}\`, and you got back **${money}**.`;
    }
    return `${action.targetName}'s ${name} is back at \`${action.from}\`.`;
}
