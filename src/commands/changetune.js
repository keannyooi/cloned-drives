"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { carSave } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const updateHands = require("../util/functions/updateHands.js");
const searchGarage = require("../util/functions/searchGarage.js");
const searchUser = require("../util/functions/searchUser.js");
const auditLog = require("../util/functions/auditLog.js");
const generateHud = require("../util/functions/generateHud.js");
const { isValidTune, getAvailableTunes } = require("../util/functions/calcTune.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const { getProfile } = require("../util/functions/profileCache.js");
const { saveGarage, snapshotHandDecks, handDeckChanges } = require("../util/functions/garageWrite.js");

module.exports = {
    name: "changetune",
    aliases: ["ct"],
    usage: "<username goes here> | <car name goes here> | <upgrade pattern>",
    args: 3,
    category: "Admin",
    description: "Changes a tune of a car in someone's garage.",
    async execute(message, args) {
        if (!isValidTune(args[args.length - 1])) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid upgrade provided.",
                desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
                author: message.author
            }).displayClosest(args[args.length - 1]);
            return errorMessage.sendMessage();
        }

        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await getCarFunc(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), undefined, { strict: true })))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await getCarFunc(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function getCarFunc(user, currentMessage) {
            const playerData = await getProfile(user.id);
            let query, searchByID = false;
            if (args[1].toLowerCase().startsWith("-c")) {
                query = [args[1].toLowerCase().slice(1)];
                searchByID = true;
            }
            else {
                query = args.slice(1, args.length - 1).map(i => i.toLowerCase());
            }

            await new Promise(resolve => resolve(searchGarage({
                message,
                query,
                garage: playerData.garage,
                amount: 1,
                searchByID,
                currentMessage
            })))
                .then(async response => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    // Awaited so the per-user command lock covers the whole dialog.
                    await changeTune(user, result, playerData, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        function changeTune(user, currentCar, playerData, currentMessage) {
            return new Promise(resolve => resolve(selectUpgrade({ message, currentCar, amount: 1, currentMessage })))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    const [origUpgrade, currentMessage] = response;
                    let upgrade = args[args.length - 1];
                    // playerData was read before the dialogs: saveGarage guards the
                    // decrement, so a change the player made meanwhile fails the write
                    // instead of being overwritten.
                    const before = structuredClone(playerData.garage);
                    const handDecks = snapshotHandDecks(playerData);
                    const ownedCar = playerData.garage.find(c => c.carID === currentCar.carID);
                    const changedError = () => new ErrorMessage({
                        channel: message.channel,
                        title: `Error, ${user.username}'s garage changed while you were deciding.`,
                        desc: "They no longer own this car at the selected tune. Please run the command again.",
                        author: message.author
                    }).sendMessage({ currentMessage });
                    if (!ownedCar || (ownedCar.upgrades[origUpgrade] || 0) < 1) return changedError();

                    ownedCar.upgrades[upgrade] = (ownedCar.upgrades[upgrade] || 0) + 1;
                    ownedCar.upgrades[origUpgrade]--;
                    updateHands(playerData, ownedCar.carID, origUpgrade, upgrade);

                    let car = getCar(ownedCar.carID);
                    const [{ ok }, attachment] = await Promise.all([
                        saveGarage({
                            userID: user.id,
                            before,
                            after: playerData.garage,
                            // hand/decks only when updateHands changed them, and only if
                            // still as read: the target is not under the admin's command
                            // lock, so a stale copy would revert a cd-sethand they ran
                            // during the dialog.
                            ...handDeckChanges(playerData, handDecks),
                            baseStamp: playerData.cacheStamp
                        }),
                        generateHud(car, upgrade)
                    ]);
                    if (!ok) return changedError();
                    auditLog(message, { command: "changetune", target: user, details: { carID: ownedCar.carID, from: origUpgrade, to: upgrade } });

                    const successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed tune for ${user.username}'s ${carNameGen({ currentCar: car })}!`,
                        desc: "Current upgrade status:",
                        author: message.author,
                        fields: [
                            { name: "Gearing Upgrade", value: `\`${origUpgrade[0]} => ${upgrade[0]}\``, inline: true },
                            { name: "Engine Upgrade", value: `\`${origUpgrade[1]} => ${upgrade[1]}\``, inline: true },
                            { name: "Chassis Upgrade", value: `\`${origUpgrade[2]} => ${upgrade[2]}\``, inline: true }
                        ]
                    });
                    return successMessage.sendMessage({ attachment, currentMessage });
                });
        }
    }
};
