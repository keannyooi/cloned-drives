"use strict";

const bot = require("../config/config.js");
const { getCarFiles, getTrackFiles, getPackFiles, getCar, getTrack, getPack } = require("../util/functions/dataManager.js");
const { DateTime } = require("luxon");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { carSave, moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const search = require("../util/functions/search.js");
const carNameGen = require("../util/functions/carNameGen.js");
const editFilter = require("../util/functions/editFilter.js");
const filterCheck = require("../util/functions/filterCheck.js");
const listRewards = require("../util/functions/listRewards.js");
const sortCars = require("../util/functions/sortCars.js");
const generateHud = require("../util/functions/generateHud.js");
const { isValidTune, getAvailableTunes } = require("../util/functions/calcTune.js");
const profileModel = require("../models/profileSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "editchampionship",
    usage: [
        "<championship name> name <new name>",
        "<championship name> duration <amount of days>",
        "<championship name> extend <amount of hours>",
        "<championship name> setcar <round number> <car name>",
        "<championship name> settune <round number> <upgrade>",
        "<championship name> addreq <round number> <requirement> <corresponding values> (same syntax as cd-filter))",
        "<championship name> settrack <round number> <track name>",
        "<championship name> addreward <round number> <money/fusetokens/trophies> <amount>",
        "<championship name> addreward <round number> car <car name> <upgrade>",
        "<championship name> addreward <round number> pack <pack name>",
        "<championship name> removereward <round number> <reward type / all>",
        "<championship name> regentracks <asphalt / dirt / snow>",
        "<championship name> regenopponents <random / filter>"
    ],
    args: 3,
    category: "Admin",
    description: "Edits an championship.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        const trackFiles = getTrackFiles();
        const packFiles = getPackFiles();
        
        const championships = await championshipModel.find();
        let query = [args[0].toLowerCase()];
        await new Promise(resolve => resolve(search(message, query, championships, "championships")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await editchampionship(...response);
            })
            .catch(error => {
                throw error;
            });

        async function editchampionship(currentchampionship, currentMessage) {
            let successMessage, operationFailed = false;
            let index, criteria = args[1].toLowerCase(), attachment = null;
            if (criteria.startsWith("add") || criteria.startsWith("remove") || criteria.startsWith("set")) {
                if (!args[3]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, arguments provided incomplete.",
                        desc: "Please refer to `cd-help editchampionship` for the syntax list.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                else if (isNaN(args[2]) || args[2] < 1 || args[2] > currentchampionship.roster.length) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, roster index provided invalid.",
                        desc: `For this championship, roster indexes must be a number between 1 and ${currentchampionship.roster.length}.`,
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
                    let oldName = currentchampionship.name;
                    let championshipName = args.slice(2, args.length).join(" ");
                    currentchampionship.name = championshipName;

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the championship name from ${oldName} to ${championshipName}!`,
                        author: message.author
                    });
                    break;
                case "duration":
                    if (currentchampionship.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this value cannot be edited while the championship is live.",
                            desc: "If you edit this value while an championship is live, it would break the bot. If you want to extend the time of an championship, use `cd-editchampionship <championship name> extend <time in hours>`.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let duration = args[2];
                    if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The duration in days must be a positive number. If you want an championship to last forever, just type `unlimited`.",
                            author: message.author
                        }).displayClosest(duration);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    currentchampionship.deadline = `${duration}d`;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the duration of the ${currentchampionship.name} championship to \`${duration} day(s)\`!`,
                        author: message.author
                    });
                    break;
                case "extend":
                    if (!currentchampionship.isActive || currentchampionship.deadline === "unlimited") {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this attribute can only be edited while a timed championship is live.",
                            desc: "This command is only intended for the unlikely scenario of bot-related delays. Unlimited time championships don't need this command.",
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

                    let origDate = DateTime.fromISO(currentchampionship.deadline);
                    currentchampionship.deadline = origDate.plus({ hours: time }).toISO();
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully extended the duration of the ${currentchampionship.name} championship by \`${time} hour(s)\`!`,
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
                                const carId = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
                                currentchampionship.roster[index - 1].carID = carId.slice(0, 6);

                                let currentCar = getCar(carId);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully set the car of roster position ${index} to ${carNameGen({ currentCar, rarity: true })}!`,
                                    author: message.author,
                                    image: currentCar["racehud"]
                                });
                            }
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "settune":
                    let upgrade = args[3];
                    let currentCar = getCar(currentchampionship.roster[index - 1].carID);
                    if (!isValidTune(upgrade)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, the tuning stage you requested is unavailable.",
                            desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
                            author: message.author
                        }).displayClosest(upgrade);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    attachment = await generateHud(currentCar, upgrade);
                    currentchampionship.roster[index - 1].upgrade = upgrade;
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
                            desc: "Please refer to `cd-help editchampionship` for the syntax list.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    let result = editFilter(message, currentchampionship.roster[index - 1].reqs, args.slice(3, args.length));
                    if (!Array.isArray(result)) return;
                    currentchampionship.roster[index - 1].reqs = result[0];
                    successMessage = result[1];
                    break;
                case "removereq":
                    args = args.slice(3, args.length);
                    args.unshift("remove");
                    let result2 = editFilter(message, currentchampionship.roster[index - 1].reqs, args);
                    if (!Array.isArray(result2)) return;
                    currentchampionship.roster[index - 1].reqs = result2[0];
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
                                const trackId = trackFile.endsWith('.json') ? trackFile.slice(0, -5) : trackFile.slice(0, 6);
                                currentchampionship.roster[index - 1].track = trackId.slice(0, 6);
                                let currentTrack = getTrack(trackId);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully set the track of roster position ${index} to ${currentTrack["trackName"]}!`,
                                    desc: "You are expected to provide a name for the championship after the criteria.",
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
                    if (Object.keys(currentchampionship.roster[index - 1].rewards).length >= 3) {
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
                                currentchampionship.roster[index - 1].rewards.money = parseInt(amount);
                            }
                            else if (rewardType === "fusetokens") {
                                emoji = bot.emojis.cache.get(fuseEmojiID);
                                currentchampionship.roster[index - 1].rewards.fuseTokens = parseInt(amount);
                            }
                            else {
                                emoji = bot.emojis.cache.get(trophyEmojiID);
                                currentchampionship.roster[index - 1].rewards.trophies = parseInt(amount);
                            }

                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added ${emoji}${amount} to the rewards for round ${index}!`,
                                author: message.author,
                                fields: [{ name: "Current Rewards", value: listRewards(currentchampionship.roster[index - 1].rewards), inline: true }]
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
                            if (!isValidTune(upgrade)) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, invalid upgrade provided.",
                                    desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
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
                                        const carId = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
                                        currentchampionship.roster[index - 1].rewards.car = { carID: carId.slice(0, 6), upgrade };

                                        let cardThing = getCar(carId);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully added 1 ${carNameGen({ currentCar: cardThing, rarity: true, upgrade })} to the rewards for round ${index}!`,
                                            author: message.author,
                                            fields: [{ name: "Current Rewards", value: listRewards(currentchampionship.roster[index - 1].rewards) }],
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
                                        const packId = packFile.endsWith('.json') ? packFile.slice(0, -5) : packFile.slice(0, 6);
                                        currentchampionship.roster[index - 1].rewards.pack = packId.slice(0, 6);

                                        let currentPack = getPack(packId);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully added 1 ${currentPack["packName"]} to the rewards for round ${index}!`,
                                            author: message.author,
                                            fields: [{ name: "Current Rewards", value: listRewards(currentchampionship.roster[index - 1].rewards) }],
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
                        currentchampionship.roster[index - 1].rewards = {};
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed all of round ${index}'s rewards!`,
                            author: message.author
                        });
                    }
                    else if (currentchampionship.roster[index - 1].rewards[type]) {
                        delete currentchampionship.roster[index - 1].rewards[type];
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully removed \`${type}\` from round ${index}'s rewards!`,
                            author: message.author,
                            fields: [{ name: "Current Rewards", value: listRewards(currentchampionship.roster[index - 1].rewards), inline: true }]
                        });
                    }
                    else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, no reward of specified type found.",
                            desc: "Please refer to the championship layout by doing `cd-championship <championship name>`.",
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
                                const trackId = track.endsWith('.json') ? track.slice(0, -5) : track;
                                let trackContents = getTrack(trackId);
                                return trackContents["surface"] === "Asphalt";
                            });
                            break;
                        case "dirt":
                            generationPool = trackFiles.filter(track => {
                                const trackId = track.endsWith('.json') ? track.slice(0, -5) : track;
                                let trackContents = getTrack(trackId);
                                return trackContents["surface"] === "Dirt" || trackContents["surface"] === "Gravel";
                            });
                            break;
                        case "snow":
                            generationPool = trackFiles.filter(track => {
                                const trackId = track.endsWith('.json') ? track.slice(0, -5) : track;
                                let trackContents = getTrack(trackId);
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
                    for (let i = 0; i < currentchampionship.roster.length; i++) {
                        const randomTrack = generationPool[Math.floor(Math.random() * generationPool.length)];
                        const trackIdForRoster = randomTrack.endsWith('.json') ? randomTrack.slice(0, -5) : randomTrack;
                        currentchampionship.roster[i].track = trackIdForRoster.slice(0, 6);
                    }

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated tracks for the ${currentchampionship.name} championship!`,
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
                    regenPool = regenPool.filter(car => {
                        const carId = car.endsWith('.json') ? car.slice(0, -5) : car.slice(0, 6);
                        return filterCheck({ 
                            car: {
                                carID: carId,
                                "000": 1,
                                "333": 1,
                                "666": 1,
                                "996": 1,
                                "969": 1,
                                "699": 1
                            },
                            filter
                        });
                    });
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
                    for (let i = 0; i < currentchampionship.roster.length; i++) {
                        const randomCar = regenPool[Math.floor(Math.random() * regenPool.length)];
                        const carId = randomCar.endsWith('.json') ? randomCar.slice(0, -5) : randomCar.slice(0, 6);
                        opponentIDs[i] = carId.slice(0, 6);
                    }
                    opponentIDs = sortCars(opponentIDs, "cr", "ascending");

                    let upgrades = getAvailableTunes();
                    for (let i = 0; i < currentchampionship.roster.length; i++) {
                        currentchampionship.roster[i].carID = opponentIDs[i];
                        currentchampionship.roster[i].upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
                    }

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated opponents for the ${currentchampionship.name} championship!`,
                        author: message.author
                    });
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, championship editing criteria not found.",
                        desc: `Here is a list of championship editing criterias. 
                            \`name\` - The name of the championship. 
                            \`duration\` - How long an championship is going to last for (in days). 
                            \`extend\` - How long an championship is going to be extended by (in hours). 
                            \`setcar\` - Sets the opponent's car.
                            \`addreward\` - Adds a reward of a round.
                            \`removereward\` - Removes a reward from a round.
                            \`settune\` - Sets the tune for the opponent's car.
                            \`addreq\` - Adds a requirement to a round.
                            \`removereq\` - Removes a requirement from a round.
                            \`regentracks\` - Regenerates tracks for every single round of an championship.
                            \`regenopponents\` - Regenerates opponents for every single round of an championship.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
            };

            if (!operationFailed) {
                await championshipModel.updateOne({ championshipID: currentchampionship.championshipID }, currentchampionship);
                return successMessage.sendMessage({ attachment, currentMessage });
            }
        }
    }
};