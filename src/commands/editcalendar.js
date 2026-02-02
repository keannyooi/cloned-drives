"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { getCarFiles, getTrackFiles, getPackFiles, getCar, getTrack, getPack } = require("../util/functions/dataManager.js");
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
const calendarModel = require("../models/calendarSchema.js");

module.exports = {
    name: "editcalendar",
    usage: [
        "<calendar name> name <new name>",
        "<calendar name> duration <days / unlimited>",
        "<calendar name> extend <hours>",
        "<calendar name> unlocktime <HH:MM> (24-hour UTC format)",
        "<calendar name> setcar <day number> <car name>",
        "<calendar name> settune <day number> <upgrade>",
        "<calendar name> settrack <day number> <track name>",
        "<calendar name> addreq <day number> <requirement> <values>",
        "<calendar name> removereq <day number> <requirement / all>",
        "<calendar name> addreward <day number> <money/fusetokens/trophies> <amount>",
        "<calendar name> addreward <day number> car <car name> <upgrade>",
        "<calendar name> addreward <day number> pack <pack name>",
        "<calendar name> removereward <day number> <reward type / all>",
        "<calendar name> streakbonus <interval> <money/fusetokens/trophies> <amount>",
        "<calendar name> streakbonus disable",
        "<calendar name> completionbonus <money/fusetokens/trophies> <amount>",
        "<calendar name> completionbonus car <car name> <upgrade>",
        "<calendar name> completionbonus pack <pack name>",
        "<calendar name> completionbonus disable",
        "<calendar name> addday",
        "<calendar name> removeday <day number>",
        "<calendar name> regentracks <asphalt / dirt / snow>",
        "<calendar name> regenopponents <random / filter>"
    ],
    args: 3,
    category: "Events",
    description: "Edits a calendar event.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        const trackFiles = getTrackFiles();
        const packFiles = getPackFiles();
        
        const calendars = await calendarModel.find();
        let query = [args[0].toLowerCase()];
        
        await new Promise(resolve => resolve(search(message, query, calendars, "calendar")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await editCalendar(...response);
            })
            .catch(error => {
                throw error;
            });
        
        async function editCalendar(currentCalendar, currentMessage) {
            let successMessage, operationFailed = false;
            let dayIndex, criteria = args[1].toLowerCase();
            
            // For day-specific operations, validate day number
            const dayOperations = ["setcar", "settune", "settrack", "addreq", "removereq", "addreward", "removereward"];
            if (dayOperations.includes(criteria)) {
                if (!args[3]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, arguments provided incomplete.",
                        desc: "Please refer to `cd-help editcalendar` for the syntax list.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
                
                const dayNum = parseInt(args[2]);
                if (isNaN(dayNum) || dayNum < 1 || dayNum > currentCalendar.days.length) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, day number provided invalid.",
                        desc: `For this calendar, day numbers must be between 1 and ${currentCalendar.days.length}.`,
                        author: message.author
                    }).displayClosest(args[2]);
                    return errorMessage.sendMessage({ currentMessage });
                }
                dayIndex = dayNum - 1;
            }
            
            switch (criteria) {
                case "name":
                    if (currentCalendar.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, cannot rename an active calendar.",
                            desc: "End the calendar first before renaming.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const oldName = currentCalendar.name;
                    const newName = args.slice(2).join(" ");
                    
                    if (calendars.find(cal => cal.name.toLowerCase() === newName.toLowerCase() && cal.calendarID !== currentCalendar.calendarID)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, calendar name already taken.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.name = newName;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully renamed calendar from "${oldName}" to "${newName}"!`,
                        author: message.author
                    });
                    break;
                
                case "duration":
                    if (currentCalendar.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this value cannot be edited while the calendar is active.",
                            desc: "If you want to extend the time of an active calendar, use `cd-editcalendar <calendar name> extend <hours>`.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const duration = args[2];
                    if (duration !== "unlimited" && (isNaN(duration) || parseInt(duration) < 1)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The duration in days must be a positive number. Use `unlimited` for no end date.",
                            author: message.author
                        }).displayClosest(duration);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.deadline = duration === "unlimited" ? "unlimited" : `${duration}d`;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the duration of "${currentCalendar.name}" to \`${duration === "unlimited" ? "unlimited" : duration + " day(s)"}\`!`,
                        author: message.author
                    });
                    break;
                
                case "extend":
                    if (!currentCalendar.isActive || currentCalendar.deadline === "unlimited") {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this attribute can only be edited while a timed calendar is active.",
                            desc: "This command is only for extending active calendars with a deadline. Unlimited calendars don't need this.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const extendTime = args[2];
                    if (isNaN(extendTime) || parseInt(extendTime) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided is invalid.",
                            desc: "The extended duration in hours must be a positive number.",
                            author: message.author
                        }).displayClosest(extendTime);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const origDate = DateTime.fromISO(currentCalendar.deadline);
                    currentCalendar.deadline = origDate.plus({ hours: parseInt(extendTime) }).toISO();
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully extended "${currentCalendar.name}" by \`${extendTime} hour(s)\`!`,
                        author: message.author
                    });
                    break;
                
                case "unlocktime":
                    const timeStr = args[2];
                    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
                    
                    if (!timeRegex.test(timeStr)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid time format.",
                            desc: "Please use 24-hour format: `HH:MM` (e.g., `00:00`, `12:30`, `23:59`)",
                            author: message.author
                        }).displayClosest(timeStr);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.unlockTime = timeStr;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set unlock time to \`${timeStr} UTC\`!`,
                        desc: "New days will unlock at this time each day.",
                        author: message.author
                    });
                    break;
                
                case "setcar":
                    const carQuery = args.slice(3).map(a => a.toLowerCase());
                    const carSearchResult = carFiles.filter(file => {
                        const car = getCar(file.slice(0, 6));
                        if (!car) return false;
                        const carName = `${car.make} ${car.model}`.toLowerCase();
                        return carQuery.every(word => carName.includes(word) || file.includes(word));
                    });
                    
                    if (carSearchResult.length === 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, car not found.",
                            desc: "Make sure you've spelled the car name correctly.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const selectedCarID = carSearchResult[0].slice(0, 6);
                    const selectedCar = getCar(selectedCarID);
                    currentCalendar.days[dayIndex].carID = selectedCarID;
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set Day ${dayIndex + 1}'s opponent!`,
                        desc: `Opponent: ${carNameGen({ currentCar: selectedCar, rarity: true })}`,
                        author: message.author
                    });
                    break;
                
                case "settune":
                    const tune = args[3];
                    if (!isValidTune(tune)) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid tune.",
                            desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
                            author: message.author
                        }).displayClosest(tune);
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.days[dayIndex].upgrade = tune;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set Day ${dayIndex + 1}'s tune to \`${tune}\`!`,
                        author: message.author
                    });
                    break;
                
                case "settrack":
                    const trackQuery = args.slice(3).map(a => a.toLowerCase());
                    const trackSearchResult = trackFiles.filter(file => {
                        const track = getTrack(file.slice(0, 6));
                        if (!track) return false;
                        const trackName = track.trackName.toLowerCase();
                        return trackQuery.every(word => trackName.includes(word) || file.includes(word));
                    });
                    
                    if (trackSearchResult.length === 0) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, track not found.",
                            desc: "Make sure you've spelled the track name correctly.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const selectedTrackID = trackSearchResult[0].slice(0, 6);
                    const selectedTrack = getTrack(selectedTrackID);
                    currentCalendar.days[dayIndex].track = selectedTrackID;
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set Day ${dayIndex + 1}'s track!`,
                        desc: `Track: ${selectedTrack.trackName}`,
                        author: message.author
                    });
                    break;
                
                case "addreq":
                    const reqArgs = args.slice(3);
                    const updatedReqs = editFilter(currentCalendar.days[dayIndex].reqs, reqArgs, "add");
                    
                    if (updatedReqs.error) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error adding requirement.",
                            desc: updatedReqs.error,
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.days[dayIndex].reqs = updatedReqs;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully updated Day ${dayIndex + 1}'s requirements!`,
                        author: message.author
                    });
                    break;
                
                case "removereq":
                    const reqToRemove = args[3].toLowerCase();
                    
                    if (reqToRemove === "all") {
                        currentCalendar.days[dayIndex].reqs = {};
                    } else {
                        delete currentCalendar.days[dayIndex].reqs[reqToRemove];
                    }
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed ${reqToRemove === "all" ? "all requirements" : reqToRemove + " requirement"} from Day ${dayIndex + 1}!`,
                        author: message.author
                    });
                    break;
                
                case "addreward":
                    const rewardType = args[3].toLowerCase();
                    
                    switch (rewardType) {
                        case "money":
                        case "fusetokens":
                        case "trophies":
                            const amount = parseInt(args[4]);
                            if (isNaN(amount) || amount < 1) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, invalid amount.",
                                    desc: "Amount must be a positive number.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                            
                            const rewardKey = rewardType === "fusetokens" ? "fuseTokens" : rewardType;
                            currentCalendar.days[dayIndex].rewards[rewardKey] = amount;
                            
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added ${amount.toLocaleString()} ${rewardType} to Day ${dayIndex + 1}!`,
                                author: message.author
                            });
                            break;
                        
                        case "car":
                            const rewardCarQuery = args.slice(4, -1).map(a => a.toLowerCase());
                            const rewardTune = args[args.length - 1];
                            
                            if (!isValidTune(rewardTune)) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, invalid tune for reward car.",
                                    desc: `Valid tunes: ${getAvailableTunes().join(", ")}`,
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                            
                            const rewardCarSearch = carFiles.filter(file => {
                                const car = getCar(file.slice(0, 6));
                                if (!car) return false;
                                const carName = `${car.make} ${car.model}`.toLowerCase();
                                return rewardCarQuery.every(word => carName.includes(word) || file.includes(word));
                            });
                            
                            if (rewardCarSearch.length === 0) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, reward car not found.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                            
                            const rewardCarID = rewardCarSearch[0].slice(0, 6);
                            currentCalendar.days[dayIndex].rewards.car = {
                                carID: rewardCarID,
                                upgrade: rewardTune
                            };
                            
                            const rewardCar = getCar(rewardCarID);
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added car reward to Day ${dayIndex + 1}!`,
                                desc: `Car: ${carNameGen({ currentCar: rewardCar, rarity: true })} (${rewardTune})`,
                                author: message.author
                            });
                            break;
                        
                        case "pack":
                            const packQuery = args.slice(4).map(a => a.toLowerCase());
                            const packSearchResult = packFiles.filter(file => {
                                const pack = getPack(file.slice(0, 6));
                                if (!pack) return false;
                                const packName = pack.packName.toLowerCase();
                                return packQuery.every(word => packName.includes(word) || file.includes(word));
                            });
                            
                            if (packSearchResult.length === 0) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, pack not found.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }
                            
                            const packID = packSearchResult[0].slice(0, 6);
                            currentCalendar.days[dayIndex].rewards.pack = packID;
                            
                            const rewardPack = getPack(packID);
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added pack reward to Day ${dayIndex + 1}!`,
                                desc: `Pack: ${rewardPack.packName}`,
                                author: message.author
                            });
                            break;
                        
                        default:
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, unknown reward type.",
                                desc: "Valid types: `money`, `fusetokens`, `trophies`, `car`, `pack`",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                    }
                    break;
                
                case "removereward":
                    const removeType = args[3].toLowerCase();
                    
                    if (removeType === "all") {
                        currentCalendar.days[dayIndex].rewards = {};
                    } else {
                        const removeKey = removeType === "fusetokens" ? "fuseTokens" : removeType;
                        delete currentCalendar.days[dayIndex].rewards[removeKey];
                    }
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed ${removeType === "all" ? "all rewards" : removeType + " reward"} from Day ${dayIndex + 1}!`,
                        author: message.author
                    });
                    break;
                
                case "streakbonus":
                    if (args[2].toLowerCase() === "disable") {
                        currentCalendar.streakBonus = {
                            enabled: false,
                            interval: 7,
                            rewards: {}
                        };
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: "Successfully disabled streak bonus!",
                            author: message.author
                        });
                    } else {
                        const interval = parseInt(args[2]);
                        if (isNaN(interval) || interval < 2) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, invalid streak interval.",
                                desc: "Interval must be at least 2 days.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        
                        const bonusType = args[3].toLowerCase();
                        const bonusAmount = parseInt(args[4]);
                        
                        if (!["money", "fusetokens", "trophies"].includes(bonusType) || isNaN(bonusAmount)) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, invalid streak bonus.",
                                desc: "Syntax: `streakbonus <interval> <money/fusetokens/trophies> <amount>`",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                        
                        const bonusKey = bonusType === "fusetokens" ? "fuseTokens" : bonusType;
                        currentCalendar.streakBonus = {
                            enabled: true,
                            interval: interval,
                            rewards: { [bonusKey]: bonusAmount }
                        };
                        
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully set streak bonus!`,
                            desc: `Every ${interval} consecutive days: ${bonusAmount.toLocaleString()} ${bonusType}`,
                            author: message.author
                        });
                    }
                    break;
                
                case "completionbonus":
                    if (args[2].toLowerCase() === "disable") {
                        currentCalendar.completionBonus = {
                            enabled: false,
                            rewards: {}
                        };
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: "Successfully disabled completion bonus!",
                            author: message.author
                        });
                    } else {
                        const compType = args[2].toLowerCase();
                        
                        switch (compType) {
                            case "money":
                            case "fusetokens":
                            case "trophies":
                                const compAmount = parseInt(args[3]);
                                if (isNaN(compAmount) || compAmount < 1) {
                                    const errorMessage = new ErrorMessage({
                                        channel: message.channel,
                                        title: "Error, invalid amount.",
                                        author: message.author
                                    });
                                    return errorMessage.sendMessage({ currentMessage });
                                }
                                
                                const compKey = compType === "fusetokens" ? "fuseTokens" : compType;
                                if (!currentCalendar.completionBonus.rewards) {
                                    currentCalendar.completionBonus.rewards = {};
                                }
                                currentCalendar.completionBonus.enabled = true;
                                currentCalendar.completionBonus.rewards[compKey] = compAmount;
                                
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully added completion bonus!`,
                                    desc: `Completion reward: ${compAmount.toLocaleString()} ${compType}`,
                                    author: message.author
                                });
                                break;
                            
                            case "car":
                                const compCarQuery = args.slice(3, -1).map(a => a.toLowerCase());
                                const compTune = args[args.length - 1];
                                
                                if (!isValidTune(compTune)) {
                                    const errorMessage = new ErrorMessage({
                                        channel: message.channel,
                                        title: "Error, invalid tune.",
                                        author: message.author
                                    });
                                    return errorMessage.sendMessage({ currentMessage });
                                }
                                
                                const compCarSearch = carFiles.filter(file => {
                                    const car = getCar(file.slice(0, 6));
                                    if (!car) return false;
                                    const carName = `${car.make} ${car.model}`.toLowerCase();
                                    return compCarQuery.every(word => carName.includes(word) || file.includes(word));
                                });
                                
                                if (compCarSearch.length === 0) {
                                    const errorMessage = new ErrorMessage({
                                        channel: message.channel,
                                        title: "Error, car not found.",
                                        author: message.author
                                    });
                                    return errorMessage.sendMessage({ currentMessage });
                                }
                                
                                const compCarID = compCarSearch[0].slice(0, 6);
                                currentCalendar.completionBonus.enabled = true;
                                currentCalendar.completionBonus.rewards.car = {
                                    carID: compCarID,
                                    upgrade: compTune
                                };
                                
                                const compCar = getCar(compCarID);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully added completion bonus car!`,
                                    desc: `Completion reward: ${carNameGen({ currentCar: compCar, rarity: true })} (${compTune})`,
                                    author: message.author
                                });
                                break;
                            
                            case "pack":
                                const compPackQuery = args.slice(3).map(a => a.toLowerCase());
                                const compPackSearch = packFiles.filter(file => {
                                    const pack = getPack(file.slice(0, 6));
                                    if (!pack) return false;
                                    return compPackQuery.every(word => pack.packName.toLowerCase().includes(word));
                                });
                                
                                if (compPackSearch.length === 0) {
                                    const errorMessage = new ErrorMessage({
                                        channel: message.channel,
                                        title: "Error, pack not found.",
                                        author: message.author
                                    });
                                    return errorMessage.sendMessage({ currentMessage });
                                }
                                
                                const compPackID = compPackSearch[0].slice(0, 6);
                                currentCalendar.completionBonus.enabled = true;
                                currentCalendar.completionBonus.rewards.pack = compPackID;
                                
                                const compPack = getPack(compPackID);
                                successMessage = new SuccessMessage({
                                    channel: message.channel,
                                    title: `Successfully added completion bonus pack!`,
                                    desc: `Completion reward: ${compPack.packName}`,
                                    author: message.author
                                });
                                break;
                            
                            default:
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, unknown completion bonus type.",
                                    desc: "Valid types: `money`, `fusetokens`, `trophies`, `car`, `pack`, `disable`",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                        }
                    }
                    break;
                
                case "addday":
                    if (currentCalendar.days.length >= 31) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, maximum days reached.",
                            desc: "Calendars can have at most 31 days.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const newDay = {
                        day: currentCalendar.days.length + 1,
                        carID: carFiles[Math.floor(Math.random() * carFiles.length)].slice(0, 6),
                        upgrade: getAvailableTunes()[Math.floor(Math.random() * getAvailableTunes().length)],
                        track: trackFiles[Math.floor(Math.random() * trackFiles.length)].slice(0, 6),
                        reqs: {},
                        rewards: {}
                    };
                    currentCalendar.days.push(newDay);
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully added Day ${newDay.day} to the calendar!`,
                        desc: "Use `cd-editcalendar` to customize this day.",
                        author: message.author
                    });
                    break;
                
                case "removeday":
                    if (currentCalendar.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, cannot remove days from an active calendar.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    const removeDayNum = parseInt(args[2]);
                    if (isNaN(removeDayNum) || removeDayNum < 1 || removeDayNum > currentCalendar.days.length) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, invalid day number.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    if (currentCalendar.days.length <= 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, cannot remove the last day.",
                            desc: "A calendar must have at least 1 day.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                    
                    currentCalendar.days.splice(removeDayNum - 1, 1);
                    // Renumber remaining days
                    currentCalendar.days.forEach((day, idx) => {
                        day.day = idx + 1;
                    });
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully removed Day ${removeDayNum} from the calendar!`,
                        desc: `Calendar now has ${currentCalendar.days.length} days.`,
                        author: message.author
                    });
                    break;
                
                case "regentracks":
                    const surface = args[2]?.toLowerCase();
                    let filteredTracks;
                    
                    if (surface === "asphalt") {
                        filteredTracks = trackFiles.filter(file => {
                            const track = getTrack(file.slice(0, 6));
                            return track && (track.surface === "Asphalt" || track.surface === "Track");
                        });
                    } else if (surface === "dirt") {
                        filteredTracks = trackFiles.filter(file => {
                            const track = getTrack(file.slice(0, 6));
                            return track && ["Dirt", "Gravel", "Sand"].includes(track.surface);
                        });
                    } else if (surface === "snow") {
                        filteredTracks = trackFiles.filter(file => {
                            const track = getTrack(file.slice(0, 6));
                            return track && ["Snow", "Ice"].includes(track.surface);
                        });
                    } else {
                        filteredTracks = trackFiles;
                    }
                    
                    if (filteredTracks.length === 0) {
                        filteredTracks = trackFiles;
                    }
                    
                    currentCalendar.days.forEach(day => {
                        day.track = filteredTracks[Math.floor(Math.random() * filteredTracks.length)].slice(0, 6);
                    });
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated tracks!`,
                        desc: surface ? `All days now have ${surface} tracks.` : "All days have new random tracks.",
                        author: message.author
                    });
                    break;
                
                case "regenopponents":
                    const regenMode = args[2]?.toLowerCase();
                    let newOpponents = [];
                    
                    if (regenMode === "filter") {
                        const { filter } = await profileModel.findOne({ userID: message.author.id });
                        newOpponents = carFiles.filter(file => {
                            const carID = file.slice(0, 6);
                            return filterCheck({ car: carID, filter });
                        });
                        
                        if (newOpponents.length < currentCalendar.days.length) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, not enough cars match your filter.",
                                desc: `Need ${currentCalendar.days.length} cars but filter only matches ${newOpponents.length}.`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }
                    } else {
                        newOpponents = [...carFiles];
                    }
                    
                    // Shuffle and pick
                    for (let i = newOpponents.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [newOpponents[i], newOpponents[j]] = [newOpponents[j], newOpponents[i]];
                    }
                    
                    let selectedOpponents = newOpponents.slice(0, currentCalendar.days.length).map(f => f.slice(0, 6));
                    selectedOpponents = sortCars(selectedOpponents, "cr", "ascending");
                    
                    currentCalendar.days.forEach((day, idx) => {
                        day.carID = selectedOpponents[idx];
                    });
                    
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully regenerated opponents!`,
                        desc: regenMode === "filter" ? "Opponents regenerated based on your filter." : "Random opponents assigned (sorted by CR).",
                        author: message.author
                    });
                    break;
                
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, unknown edit operation.",
                        desc: "Please refer to `cd-help editcalendar` for the syntax list.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
            }
            
            if (!operationFailed && successMessage) {
                await calendarModel.updateOne({ calendarID: currentCalendar.calendarID }, currentCalendar);
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};
