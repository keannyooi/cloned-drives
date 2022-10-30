"use strict";

const bot = require("../config/config.js");
const { readdirSync } = require("fs");
const { DateTime } = require("luxon");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const trackFiles = readdirSync("./src/tracks").filter(file => file.endsWith(".json"));
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { carSave, moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const search = require("../util/functions/search.js");
const carNameGen = require("../util/functions/carNameGen.js");
const editFilter = require("../util/functions/editFilter.js");
const filterCheck = require("../util/functions/filterCheck.js");
const listRewards = require("../util/functions/listRewards.js");
const sortCars = require("../util/functions/sortCars.js");
const generateHud = require("../util/functions/generateHud.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "editevent",
    usage: [
        "<event name> name <new name>",
        "<event name> duration <amount of days>",
        "<event name> extend <amount of hours>",
        "<event name> setcar <round number> <car name>",
        "<event name> settune <round number> <upgrade>",
        "<event name> addreq <round number> <requirement> <corresponding values> (same syntax as cd-filter))",
        "<event name> settrack <round number> <track name>",
        "<event name> addreward <round number> <money/fusetokens/trophies> <amount>",
        "<event name> addreward <round number> car <car name> <upgrade>",
        "<event name> addreward <round number> pack <pack name>",
        "<event name> removereward <round number> <reward type / all>",
        "<event name> regentracks <asphalt / dirt / snow>",
        "<event name> regenopponents <random / filter>"
    ],
    args: 3,
    category: "Events",
    description: "Edits an event.",
    async execute(message, args) {
        const events = await eventModel.find();
        let query = [args[0].toLowerCase()];
        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await editEvent(...response);
            })
            .catch(error => {
                throw error;
            });

        async function editEvent(currentEvent, currentMessage) {
            let successMessage, operationFailed = false;
            let index, criteria = args[1].toLowerCase(), attachment = null;
            if (criteria.startsWith("add") || criteria.startsWith("remove") || criteria.startsWith("set")) {
                if (!args[3]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, arguments provided incomplete.",
                        desc: "Please refer to `cd-help editevent` for the syntax list.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                else if (isNaN(args[2]) || args[2] < 1 || args[2] > currentEvent.roster.length) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, roster index provided invalid.",
                        desc: `For this event, roster indexes must be a number between 1 and ${currentEvent.roster.length}.`,
                        author: message.author
                    }).displayClosest(args[2]);
                    return errorMessage.sendMessage({ currentMessage });
                }
                else {
                    index = parseInt(args[2]);
                }
            }

            switch (criteria) {
                case "name":
                    let oldName = currentEvent.name;
                    let eventName = args.slice(2, args.length).join(" ");
                    currentEvent.name = eventName;

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the event name from ${oldName} to ${eventName}!`,
                        author: message.author
                    });
                    break;
                case "duration":
                    if (currentEvent.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this value cannot be edited while the event is live.",
                            desc: "If you edit this value while an event is live, it would break the bot. If you want to extend the time of an event, use `cd-editevent <event name> extend <time in hours>`.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let duration = args[2];
                    if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The duration in days must be a positive number. If you want an event to last forever, just type `unlimited`.",
                            author: message.author
                        }).displayClosest(duration);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    currentEvent.deadline = `${duration}d`;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the duration of the ${currentEvent.name} event to \`${duration} day(s)\`!`,
                        author: message.author
                    });
                    break;
                case "extend":
                    if (!currentEvent.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this attribute can only be edited while an event is live.",
                            desc: "This command is only intended for the unlikely scenario of bot-related delays.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let time = args[2];
                    if (isNaN(time) || parseInt(time) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided is invalid.",
                            desc: "The extended duration in hours must be a positive number.",
                            author: message.author
                        }).displayClosest(time);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let origDate = DateTime.fromISO(currentEvent.deadline);
                    currentEvent.deadline = origDate.plus({ hours: time }).toISO();
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully extended the duration of the ${currentEvent.name} event by \`${time} hour(s)\`!`,
                        author: message.author
                    });
                    break;
                case "setcar":
                    let query = args.slice(3, args.length).map(i => i.toLowerCase());
                    await new Promise(resolve => resolve(search(message, query, carFiles, "carWithBM")))
                        .then(async (response) => {
                            if (!Array.isArray(response)) {
                                operationFailed = true;
                            }
                            else {
                                let [carFile, currentMessage2] = response;
                                currentMessage = currentMessage2;
                                currentEvent.roster[index - 1].carID = carFile.slice(0, 6);

                                let currentCar = require(`../cars/${carFile}`);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully set the car of roster position ${index} to ${carNameGen({ currentCar, rarity: true })}!`,
                                    author: message.author,
                                    image: currentCar["card"]
                                });
                            }
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "settune":
                    let upgrade = args[3];
                    let currentCar = require(`../cars/${currentEvent.roster[index - 1].carID}.json`);
                    if (upgrade !== "000" && !currentCar[`${upgrade}TopSpeed`]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, the tuning stage you requested is unavailable.",
                            desc: "In order to make the tuning system less complex, the tuning stages are limited to `333`, `666`, `996`, `969` and `699`.",
                            author: message.author
                        }).displayClosest(upgrade);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    attachment = await generateHud(currentCar, upgrade);
                    currentEvent.roster[index - 1].upgrade = upgrade;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the car tune of roster position ${index} to ${upgrade}!`,
                        author: message.author,
                    });
                    break;
                case "addreq":
                    if (!args[4]) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, arguments provided incomplete.",
                            desc: "Please refer to `cd-help editevent` for the syntax list.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    let result = editFilter(message, currentEvent.roster[index - 1].reqs, args.slice(3, args.length));
                    if (!Array.isArray(result)) return;
                    currentEvent.roster[index - 1].reqs = result[0];
                    successMessage = result[1];
                    break;
                case "removereq":
                    args = args.slice(3, args.length);
                    args.unshift("remove");
                    let result2 = editFilter(message, currentEvent.roster[index - 1].reqs, args);
                    if (!Array.isArray(result2)) return;
                    currentEvent.roster[index - 1].reqs = result2[0];
                    successMessage = result2[1];
                    break;
                case "settrack":
                    let query2 = args.slice(3, args.length).map(i => i.toLowerCase());
                    await new Promise(resolve => resolve(search(message, query2, trackFiles, "track")))
                        .then(async (response) => {
                            if (!Array.isArray(response)) {
                                operationFailed = true;
                            }
                            else {
                                let [trackFile, currentMessage2] = response;
                                currentMessage = currentMessage2;
                                currentEvent.roster[index - 1].track = trackFile.slice(0, 6);
                                let currentTrack = require(`../tracks/${trackFile}`);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully set the track of roster position ${index} to ${currentTrack["trackName"]}!`,
                                    desc: "You are expected to provide a name for the event after the criteria.",
                                    author: message.author,
                                    image: currentTrack["background"]
                                });
                            }
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "addreward":
                    if (Object.keys(currentEvent.roster[index - 1].rewards).length >= 3) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, you may not add more than 3 types of rewards to a round.",
                            desc: "Please remove one type of reward before adding another.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let rewardType = args[3].toLowerCase();
                    switch (rewardType) {
                        case "money":
                        case "fusetokens":
                        case "trophies":
                            let amount = args[4];
                            if (isNaN(amount) || parseInt(amount) < 0 || (parseInt(amount) === 0 && rewardType !== "trophies")) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, amount provided invalid.",
                                    desc: "This amount should always be a positive number, i.e: `4`, `20`, etc. 0 is only for deleting the reward for trophies.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            let emoji;
                            if (rewardType === "money") {
                                emoji = bot.emojis.cache.get(moneyEmojiID);
                                currentEvent.roster[index - 1].rewards.money = parseInt(amount);
                            }
                            else if (rewardType === "fusetokens") {
                                emoji = bot.emojis.cache.get(fuseEmojiID);
                                currentEvent.roster[index - 1].rewards.fuseTokens = parseInt(amount);
                            }
                            else {
                                emoji = bot.emojis.cache.get(trophyEmojiID);
                                currentEvent.roster[index - 1].rewards.trophies = parseInt(amount);
                            }

                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added ${emoji}${amount} to the rewards for round ${index}!`,
                                author: message.author,
                                fields: [{ name: "Current Rewards", value: listRewards(currentEvent.roster[index - 1].rewards), inline: true }]
                            });
                            break;
                        case "car":
                            if (!args[5]) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, arguments provided incomplete.",
                                    desc: "You are expected to add an upgrade after the car name.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            let carName = args.slice(4, args.length - 1).map(i => i.toLowerCase());
                            let upgrade = args[args.length - 1];
                            if (!Object.keys(carSave).includes(upgrade)) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, invalid upgrade provided.",
                                    desc: "Upgrades are limited to `333`, `666`, `699`, `969` and `996` for simplicity sake.",
                                    author: message.author
                                }).displayClosest(upgrade);
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            await new Promise(resolve => resolve(search(message, carName, carFiles, "carWithBM")))
                                .then(async (response) => {
                                    if (!Array.isArray(response)) {
                                        operationFailed = true;
                                    }
                                    else {
                                        let [carFile, currentMessage2] = response;
                                        currentMessage = currentMessage2;
                                        currentEvent.roster[index - 1].rewards.car = { carID: carFile.slice(0, 6), upgrade };

                                        let cardThing = require(`../cars/${carFile}`);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully added 1 ${carNameGen({ currentCar: cardThing, rarity: true, upgrade })} to the rewards for round ${index}!`,
                                            author: message.author,
                                            fields: [{ name: "Current Rewards", value: listRewards(currentEvent.roster[index - 1].rewards) }],
                                            image: cardThing[`racehud${upgrade}`]
                                        });
                                    }
                                })
                                .catch(error => {
                                    throw error;
                                });
                            break;
                        case "pack":
                            let packName = args.slice(4, args.length).map(i => i.toLowerCase());
                            await new Promise(resolve => resolve(search(message, packName, packFiles, "pack")))
                                .then(response => {
                                    if (!Array.isArray(response)) {
                                        operationFailed = true;
                                    }
                                    else {
                                        let [packFile, currentMessage2] = response;
                                        currentMessage = currentMessage2;
                                        currentEvent.roster[index - 1].rewards.pack = packFile.slice(0, 6);

                                        let currentPack = require(`../packs/${packFile}`);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully added 1 ${currentPack["packName"]} to the rewards for round ${index}!`,
                                            author: message.author,
                                            fields: [{ name: "Current Rewards", value: listRewards(currentEvent.roster[index - 1].rewards) }],
                                            image: currentPack["pack"]
                                        });
                                    }
                                })
                                .catch(error => {
                                    throw error;
                                });
                            break;
                        default:
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, reward criteria not found.",
                                desc: `Here is a list of reward criterias. 
                                \`money\` - Awards the player money. Provide the amount of money after that.
                                \`fusetokens\` - Awards the player fuse tokens. Provide the amount of fuse tokens after that.
                                \`trophies\` - Awards the player trophies. Provide the amount of trophies after that.
                                \`car\` - Awards the player a car. Provide the name of a car after that.
                                \`pack\` - Awards the player a pack. Provide the name of a pack after that.`,
                                author: message.author
                            }).displayClosest(rewardType);
                            return errorMessage.sendMessage({ currentMessage });
                    }
                    break;
                case "removereward":
                    let type = args[3].toLowerCase().replace("token", "Token");
                    if (type === "all") {
                        currentEvent.roster[index - 1].rewards = {};
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed all of round ${index}'s rewards!`,
                            author: message.author
                        });
                    }
                    else if (currentEvent.roster[index - 1].rewards[type]) {
                        delete currentEvent.roster[index - 1].rewards[type];
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed \`${type}\` from round ${index}'s rewards!`,
                            author: message.author,
                            fields: [{ name: "Current Rewards", value: listRewards(currentEvent.roster[index - 1].rewards), inline: true }]
                        });
                    }
                    else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, no reward of specified type found.",
                            desc: "Please refer to the event layout by doing `cd-event <event name>`.",
                            author: message.author
                        }).displayClosest(type);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    break;
                case "regentracks":
                    let randomizeType = args[2].toLowerCase(), generationPool;
                    switch (randomizeType) {
                        case "asphalt":
                            generationPool = trackFiles.filter(track => {
                                let trackContents = require(`../tracks/${track}`);
                                return trackContents["surface"] === "Asphalt";
                            });
                            break;
                        case "dirt":
                            generationPool = trackFiles.filter(track => {
                                let trackContents = require(`../tracks/${track}`);
                                return trackContents["surface"] === "Dirt" || trackContents["surface"] === "Gravel";
                            });
                            break;
                        case "snow":
                            generationPool = trackFiles.filter(track => {
                                let trackContents = require(`../tracks/${track}`);
                                return trackContents["surface"] === "Snow" || trackContents["surface"] === "Ice";
                            });
                            break;
                        default:
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, track regeneration criteria not found.",
                                desc: `Here is a list of track regeneration criterias. 
                                \`asphalt\` - Generates asphalt tracks.
                                \`dirt\` - Generates dirt tracks.
                                \`snow\` - Generates snow tracks.`,
                                author: message.author
                            }).displayClosest(randomizeType);
                            return errorMessage.sendMessage({ currentMessage });
                    }
                    for (let i = 0; i < currentEvent.roster.length; i++) {
                        currentEvent.roster[i].track = generationPool[Math.floor(Math.random() * generationPool.length)].slice(0, 6);
                    }

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated tracks for the ${currentEvent.name} event!`,
                        author: message.author
                    });
                    break;
                case "regenopponents":
                    let filterType = args[2].toLowerCase(), filter;
                    switch (filterType) {
                        case "random":
                            filter = {};
                            break;
                        case "filter":
                            let playerData = await profileModel.findOne({ userID: message.author.id })
                            filter = playerData.filter;
                            break;
                        default:
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, opponent generation criteria not found.",
                                desc: `Here is a list of opponent generation criterias. 
                                \`random\` - Generates cars without limitations.
                                \`filter\` - Generates cars that comply with the current filter set by the user.`,
                                author: message.author
                            }).displayClosest(filterType);
                            return errorMessage.sendMessage({ currentMessage });
                    }

                    let regenPool = carFiles;
                    regenPool = regenPool.filter(car => filterCheck({ 
                        car: {
                            carID: car.slice(0, 6),
                            "000": 1,
                            "333": 1,
                            "666": 1,
                            "996": 1,
                            "969": 1,
                            "699": 1
                        },
                        filter
                    }));
                    if (regenPool.length < 1) {
                        const errorMessage = new SuccessMessage({
                            channel: message.channel,
                            title: "Error, it looks like there are no cars available with your filter settings.",
                            desc: "Check your filter settings using `cd-filter view`.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let opponentIDs = [];
                    for (let i = 0; i < currentEvent.roster.length; i++) {
                        opponentIDs[i] = regenPool[Math.floor(Math.random() * regenPool.length)].slice(0, 6);
                    }
                    opponentIDs = sortCars(opponentIDs, "rq", "ascending");

                    let upgrades = ["000", "333", "666", "699", "969", "996"];
                    for (let i = 0; i < currentEvent.roster.length; i++) {
                        currentEvent.roster[i].carID = opponentIDs[i];
                        currentEvent.roster[i].upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
                    }

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated opponents for the ${currentEvent.name} event!`,
                        author: message.author
                    });
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, event editing criteria not found.",
                        desc: `Here is a list of event editing criterias. 
                            \`name\` - The name of the event. 
                            \`duration\` - How long an event is going to last for (in days). 
                            \`extend\` - How long an event is going to be extended by (in hours). 
                            \`setcar\` - Sets the opponent's car.
                            \`addreward\` - Adds a reward of a round.
                            \`removereward\` - Removes a reward from a round.
                            \`settune\` - Sets the tune for the opponent's car.
                            \`addreq\` - Adds a requirement to a round.
                            \`removereq\` - Removes a requirement from a round.
                            \`regentracks\` - Regenerates tracks for every single round of an event.
                            \`regenopponents\` - Regenerates opponents for every single round of an event.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
            };

            if (!operationFailed) {
                await eventModel.updateOne({ eventID: currentEvent.eventID }, currentEvent);
                return successMessage.sendMessage({ attachment, currentMessage });
            }
        }
    }
};