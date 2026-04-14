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
        "<championship name> regenopponents <random / filter>",
        "<championship name> bulk <round number> <JSON object> [<round number> <JSON object> ...]"
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
            if (criteria.startsWith("add") || criteria.startsWith("remove") || criteria.startsWith("set") || criteria === "bulk") {
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
                case "bulk":
                    // ---- Shared validation constants ----
                    const reqKeyMap = {
                        cr: "cr", make: "make", tags: "tags", collection: "collection",
                        bodystyle: "bodyStyle", bodyStyle: "bodyStyle", hiddenTag: "hiddenTag", hiddentag: "hiddenTag",
                        modelyear: "modelYear", modelYear: "modelYear",
                        seatcount: "seatCount", seatCount: "seatCount",
                        enginepos: "enginePos", enginePos: "enginePos",
                        drivetype: "driveType", driveType: "driveType",
                        fueltype: "fuelType", fuelType: "fuelType",
                        tyretype: "tyreType", tyreType: "tyreType",
                        country: "country", gc: "gc", creator: "creator",
                        abs: "abs", tcs: "tcs",
                        isPrize: "isPrize", isprize: "isPrize",
                        isStock: "isStock", isstock: "isStock",
                        isBM: "isBM", isbm: "isBM",
                        search: "search"
                    };
                    const arrayKeys = ["make", "tags", "collection", "bodyStyle", "hiddenTag"];
                    const rangeKeys = ["cr", "modelYear", "seatCount"];
                    const stringKeys = ["country", "tyreType", "driveType", "enginePos", "fuelType", "gc", "creator"];
                    const booleanKeys = ["abs", "tcs", "isPrize", "isStock", "isBM"];
                    const validBulkTunes = ["000", "333", "666", "699", "969", "996"];

                    // ---- Parse round/JSON pairs from the raw input ----
                    const rawBulk = args.slice(2).join(" ");
                    const bulkRounds = [];
                    let parseIdx = 0;

                    while (parseIdx < rawBulk.length) {
                        while (parseIdx < rawBulk.length && rawBulk[parseIdx] === " ") parseIdx++;
                        if (parseIdx >= rawBulk.length) break;

                        let numStr = "";
                        while (parseIdx < rawBulk.length && rawBulk[parseIdx] >= "0" && rawBulk[parseIdx] <= "9") {
                            numStr += rawBulk[parseIdx];
                            parseIdx++;
                        }
                        if (!numStr) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, expected a round number.",
                                desc: `Parsing failed near position ${parseIdx}. Format: \`bulk <round> <JSON> [<round> <JSON> ...]\``,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        while (parseIdx < rawBulk.length && rawBulk[parseIdx] === " ") parseIdx++;

                        if (parseIdx >= rawBulk.length || rawBulk[parseIdx] !== "{") {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, expected a JSON object after round number.",
                                desc: `Expected \`{\` after round ${numStr}. Format: \`bulk <round> <JSON> [<round> <JSON> ...]\``,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        let depth = 0, jsonStart = parseIdx;
                        while (parseIdx < rawBulk.length) {
                            if (rawBulk[parseIdx] === "{") depth++;
                            else if (rawBulk[parseIdx] === "}") depth--;
                            parseIdx++;
                            if (depth === 0) break;
                        }

                        if (depth !== 0) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, unmatched braces in JSON.",
                                desc: `The JSON for round ${numStr} has unmatched \`{\` or \`}\`. Check your formatting.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        bulkRounds.push({ roundNum: parseInt(numStr), jsonStr: rawBulk.slice(jsonStart, parseIdx) });
                    }

                    if (bulkRounds.length === 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, no round data provided.",
                            desc: "Format: `bulk <round> <JSON>` or `bulk <round> <JSON> <round> <JSON> ...`",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    // ---- Validate all rounds before applying any ----
                    const validatedBulkRounds = [];
                    for (const entry of bulkRounds) {
                        const roundLabel = `Round ${entry.roundNum}`;

                        if (entry.roundNum < 1 || entry.roundNum > currentchampionship.roster.length) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, invalid round number in bulk data.`,
                                desc: `${roundLabel}: must be between 1 and ${currentchampionship.roster.length}.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        let roundData;
                        try {
                            roundData = JSON.parse(entry.jsonStr);
                        } catch (e) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, invalid JSON for ${roundLabel}.`,
                                desc: `\`${e.message}\`\nMake sure your JSON is properly formatted.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        if (!roundData.carID || !roundData.upgrade || !roundData.track) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, missing required fields in ${roundLabel}.`,
                                desc: "Each round JSON must contain at least `carID`, `upgrade`, and `track`.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        let bulkCarFile = carFiles.find(file => file.startsWith(roundData.carID));
                        if (!bulkCarFile) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, car not found in ${roundLabel}.`,
                                desc: `No car found with ID \`${roundData.carID}\`.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        let bulkTrackFile = trackFiles.find(file => file.startsWith(roundData.track));
                        if (!bulkTrackFile) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, track not found in ${roundLabel}.`,
                                desc: `No track found with ID \`${roundData.track}\`.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        if (!validBulkTunes.includes(roundData.upgrade)) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: `Error, invalid upgrade in ${roundLabel}.`,
                                desc: "Valid upgrades are `000`, `333`, `666`, `996`, `969`, and `699`.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Validate and normalize reqs
                        let validatedReqs = {};
                        if (roundData.reqs && typeof roundData.reqs === "object") {
                            const bulkErrors = [];
                            for (const [rawKey, value] of Object.entries(roundData.reqs)) {
                                const key = reqKeyMap[rawKey];
                                if (!key) {
                                    bulkErrors.push(`Unknown req key: \`${rawKey}\``);
                                    continue;
                                }

                                if (arrayKeys.includes(key)) {
                                    const arrayValue = Array.isArray(value) ? value : [value];
                                    const normalized = arrayValue.map(v => String(v).toLowerCase());
                                    for (const val of normalized) {
                                        const exists = carFiles.some(file => {
                                            const car = getCar(file);
                                            const ref = car["reference"] ? getCar(car["reference"]) : car;
                                            if (key === "collection") {
                                                return Array.isArray(car[key]) && car[key].some(c => c.toLowerCase() === val);
                                            }
                                            if (key === "hiddenTag") {
                                                return Array.isArray(car[key]) && car[key].some(t => t.toLowerCase() === val);
                                            }
                                            const field = ref[key];
                                            if (Array.isArray(field)) return field.some(t => t.toLowerCase() === val);
                                            return typeof field === "string" && field.toLowerCase() === val;
                                        });
                                        if (!exists) {
                                            bulkErrors.push(`\`${key}\` value \`${val}\` doesn't match any car in the game`);
                                        }
                                    }
                                    validatedReqs[key] = normalized;
                                } else if (rangeKeys.includes(key)) {
                                    if (typeof value !== "object" || value.start === undefined || value.end === undefined) {
                                        bulkErrors.push(`\`${key}\` must be an object with start and end, e.g. {"start": 0, "end": 100}`);
                                        continue;
                                    }
                                    const start = parseInt(value.start);
                                    const end = parseInt(value.end);
                                    if (isNaN(start) || isNaN(end)) {
                                        bulkErrors.push(`\`${key}\` start and end must be numbers`);
                                        continue;
                                    }
                                    if (end < start) {
                                        bulkErrors.push(`\`${key}\` end (${end}) must be >= start (${start})`);
                                        continue;
                                    }
                                    validatedReqs[key] = { start, end };
                                } else if (stringKeys.includes(key)) {
                                    const normalized = String(value).toLowerCase();
                                    const exists = carFiles.some(file => {
                                        const car = getCar(file);
                                        return !car["reference"] && typeof car[key] === "string" && car[key].toLowerCase() === normalized;
                                    });
                                    if (!exists) {
                                        bulkErrors.push(`\`${key}\` value \`${normalized}\` doesn't match any car in the game`);
                                    }
                                    validatedReqs[key] = normalized;
                                } else if (booleanKeys.includes(key)) {
                                    if (typeof value !== "boolean") {
                                        bulkErrors.push(`\`${key}\` must be true or false`);
                                        continue;
                                    }
                                    validatedReqs[key] = value;
                                } else if (key === "search") {
                                    validatedReqs[key] = String(value).toLowerCase();
                                }
                            }

                            if (bulkErrors.length > 0) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: `Error, invalid reqs in ${roundLabel}.`,
                                    desc: bulkErrors.join("\n"),
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                        }

                        // Validate rewards
                        let validatedRewards = {};
                        if (roundData.rewards && typeof roundData.rewards === "object") {
                            const rewardErrors = [];
                            for (const [key, value] of Object.entries(roundData.rewards)) {
                                switch (key) {
                                    case "money":
                                    case "fuseTokens":
                                    case "trophies":
                                        if (isNaN(value) || parseInt(value) < 0) {
                                            rewardErrors.push(`\`${key}\` must be a non-negative number`);
                                        } else {
                                            validatedRewards[key] = parseInt(value);
                                        }
                                        break;
                                    case "car":
                                        let carReward = typeof value === "string" ? { carID: value, upgrade: "000" } : value;
                                        if (!carReward.carID) {
                                            rewardErrors.push("`car` reward must have a `carID` field (or just a car ID string)");
                                        } else if (!carFiles.find(f => f.startsWith(carReward.carID))) {
                                            rewardErrors.push(`Car \`${carReward.carID}\` not found`);
                                        } else if (!validBulkTunes.includes(carReward.upgrade || "000")) {
                                            rewardErrors.push(`Invalid upgrade \`${carReward.upgrade}\` for car reward`);
                                        } else {
                                            validatedRewards.car = { carID: carReward.carID, upgrade: carReward.upgrade || "000" };
                                        }
                                        break;
                                    case "pack":
                                        if (!packFiles.find(f => f.startsWith(value))) {
                                            rewardErrors.push(`Pack \`${value}\` not found`);
                                        } else {
                                            validatedRewards.pack = value;
                                        }
                                        break;
                                    default:
                                        rewardErrors.push(`Unknown reward type: \`${key}\``);
                                }
                            }
                            if (rewardErrors.length > 0) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: `Error, invalid rewards in ${roundLabel}.`,
                                    desc: rewardErrors.join("\n"),
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                        }

                        validatedBulkRounds.push({
                            roundNum: entry.roundNum,
                            data: {
                                carID: roundData.carID,
                                upgrade: roundData.upgrade,
                                track: roundData.track,
                                reqs: validatedReqs,
                                rewards: validatedRewards
                            },
                            carFile: bulkCarFile,
                            trackFile: bulkTrackFile
                        });
                    }

                    // ---- All rounds validated — apply them all ----
                    const roundSummaries = [];
                    for (const round of validatedBulkRounds) {
                        currentchampionship.roster[round.roundNum - 1] = round.data;
                        let bulkCar = getCar(round.carFile);
                        let bulkTrack = getTrack(round.trackFile);
                        roundSummaries.push(`**Round ${round.roundNum}:** ${carNameGen({ currentCar: bulkCar, rarity: true, upgrade: round.data.upgrade })} on ${bulkTrack.trackName}`);
                    }

                    if (validatedBulkRounds.length === 1) {
                        let r = validatedBulkRounds[0];
                        let singleCar = getCar(r.carFile);
                        let singleTrack = getTrack(r.trackFile);
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully updated round ${r.roundNum} of ${currentchampionship.name}!`,
                            desc: `**Car:** ${carNameGen({ currentCar: singleCar, rarity: true, upgrade: r.data.upgrade })}\n**Track:** ${singleTrack.trackName}\n**Rewards:** ${listRewards(r.data.rewards) || "None"}`,
                            author: message.author
                        });
                    } else {
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully updated ${validatedBulkRounds.length} rounds of ${currentchampionship.name}!`,
                            desc: roundSummaries.join("\n"),
                            author: message.author
                        });
                    }
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
                            \`regentracks\` - Regenerates tracks for every single round of a championship.
                            \`regenopponents\` - Regenerates opponents for every single round of a championship.
                            \`bulk\` - Sets all round data from JSON. Supports multiple rounds at once.`,
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