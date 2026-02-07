"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack, getCarFiles, getPackFiles } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const offerModel = require("../models/offerSchema.js");

const carFiles = getCarFiles();
const packFiles = getPackFiles();

module.exports = {
    name: "editoffer",
    usage: [
        "<offer name> name <new name>",
        "<offer name> price <new price>",
        "<offer name> stock <new stock>",
        "<offer name> duration <amount of days>",
        "<offer name> extend <amount of hours>",
        "<offer name> addcontent fusetokens <amount>",
        "<offer name> addcontent <cars/pack> <car/pack name>",
        "<offer name> removecontent <fusetokens/pack>",
        "<offer name> removecontent cars <car name>"
    ],
    args: 3,
    category: "Events",
    description: "Edits an offer.",
    async execute(message, args) {
        const offers = await offerModel.find();
        let query = [args[0].toLowerCase()];
        await new Promise(resolve => resolve(search(message, query, offers, "offer")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await editOffer(...response);
            })
            .catch(error => {
                throw error;
            });

        async function editOffer(offer, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            let criteria = args[1].toLowerCase(), criteria2 = args[2].toLowerCase(), operationFailed = false, successMessage;
            if ((criteria.startsWith("add") || (criteria.startsWith("remove") && criteria2 === "cars")) && !args[3]) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, arguments provided incomplete.",
                    desc: "Please refer to `cd-help editoffer` for the syntax list.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            switch (criteria) {
                case "name":
                    let oldName = offer.name;
                    let offerName = args.slice(2, args.length).join(" ");
                    offer.name = offerName;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the offer name from ${oldName} to ${offerName}!`,
                        author: message.author
                    });
                    break;
                case "price":
                    if (isNaN(criteria2) || parseInt(criteria2) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, price provided invalid.",
                            desc: "An offer's price should always be a positive number, i.e: `360`, `727`, etc.",
                            author: message.author
                        }).displayClosest(criteria2);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    offer.price = parseInt(criteria2);
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the ${offer.name} offer's price to ${moneyEmoji}${offer.price}!`,
                        author: message.author
                    });
                    break;
                case "stock":
                    if (isNaN(criteria2) || parseInt(criteria2) < 1 || parseInt(criteria2) > 50) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, stock provided is invalid.",
                            desc: "A limited offer's stock is restricted to 1 ~ 50.",
                            author: message.author
                        }).displayClosest(criteria2);
                        return errorMessage.sendMessage();
                    }

                    offer.stock = parseInt(criteria2);
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the ${offer.name} offer's available stock to ${offer.stock}!`,
                        author: message.author
                    });
                    break;
                case "duration":
                    if (offer.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this value cannot be edited while the offer is live.",
                            desc: "If you edit this value while an offer is live, it would break the bot. If you want to extend the time of an offer, use `cd-editevent <event name> extend <time in hours>`.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let duration = criteria2;
                    if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided invalid.",
                            desc: "The duration in days must be a positive number. If you want an offer to last forever, just type `unlimited`.",
                            author: message.author
                        }).displayClosest(duration);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    offer.deadline = `${duration}d`;
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully changed the duration of the ${offer.name} to \`${duration} day(s)\`!`,
                        author: message.author
                    });
                    break;
                case "extend":
                    if (!offer.isActive) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, this attribute can only be edited while an offer is live.",
                            desc: "This command is only intended for the unlikely scenario of bot-related delays.",
                            author: message.author
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let time = criteria2;
                    if (isNaN(time) || parseInt(time) < 1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, duration provided is invalid.",
                            desc: "The extended duration in hours must be a positive number.",
                            author: message.author
                        }).displayClosest(time);
                        return errorMessage.sendMessage({ currentMessage });
                    }

                    let origDate = DateTime.fromISO(offer.deadline);
                    offer.deadline = origDate.plus({ hours: time }).toISO();
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully extended the duration of the ${offer.name} offer by \`${time} hour(s)\`!`,
                        author: message.author
                    });
                    break;
                case "addcontent":
                    switch (criteria2) {
                        case "pack":
                            let packName = args.slice(3, args.length).map(i => i.toLowerCase());
                            await new Promise(resolve => resolve(search(message, packName, packFiles, "pack")))
                                .then(response => {
                                    if (!Array.isArray(response)) {
                                        operationFailed = true;
                                    }
                                    else {
                                        let [packFile, currentMessage2] = response;
                                        currentMessage = currentMessage2;
                                        offer.offer.pack = packFile.slice(0, 6);

                                        let currentPack = getPack(packFile);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully assigned a(n) ${currentPack["packName"]} to the ${offer.name} offer!`,
                                            author: message.author,
                                            image: currentPack["pack"]
                                        });
                                    }
                                })
                                .catch(error => {
                                    throw error;
                                });
                            break;
                        case "cars":
                            let carName = args.slice(3, args.length).map(i => i.toLowerCase());
                            await new Promise(resolve => resolve(search(message, carName, carFiles, "carWithBM")))
                                .then(async (response) => {
                                    if (!Array.isArray(response)) {
                                        operationFailed = true;
                                    }
                                    else {
                                        let [carFile, currentMessage2] = response;
                                        currentMessage = currentMessage2;
                                        if (offer.offer.cars) {
                                            offer.offer.cars.push(carFile.slice(0, 6));
                                        }
                                        else {
                                            offer.offer.cars = [carFile.slice(0, 6)];
                                        }

                                        let list = "";
                                        for (let i = 0; i < offer.offer.cars.length; i++) {
                                            let car = getCar(offer.offer.cars[i]);
                                            list += `${carNameGen({ currentCar: car, rarity: true })}\n`;
                                        }

                                        let currentCar = getCar(carFile);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully added 1 ${carNameGen({ currentCar })} to the ${offer.name} offer!`,
                                            author: message.author,
                                            fields: [{ name: "Current Cars", value: list }],
                                            image: currentCar["racehud"]
                                        });
                                    }
                                })
                                .catch(error => {
                                    throw error;
                                });
                            break;
                        case "fusetokens":
                            if (isNaN(args[3]) || args[3] < 1) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, fuse token amount provided is invalid.",
                                    desc: "This amount should always be a positive number, i.e: `997`, `500`, etc.",
                                    author: message.author
                                }).displayClosest(args[3]);
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            let amount = parseInt(args[3]);
                            offer.offer.fuseTokens = amount;
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully assigned ${fuseEmoji}${amount} to the ${offer.name} offer!`,
                                author: message.author
                            });
                            break;
                        default:
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, offer editing criteria not found.",
                                desc: `Here is a list of offer editing criterias. 
                                \`pack\` - Sets a pack to the offer bundle. Provide the name of a pack after that.
                                \`cars\` - Adds a car to the offer bundle. Provide the name of a car after that.
                                \`fusetokens\` - Sets a certain amount of fuse tokens to the offer bundle. Provide the amount of fuse tokens after that.`,
                                author: message.author
                            }).displayClosest(criteria2);
                            return errorMessage.sendMessage({ currentMessage });
                    }
                    break;
                case "removecontent":
                    switch (criteria2) {
                        case "fusetokens":
                        case "pack":
                            delete offer.offer[criteria2.replace("tokens", "Tokens")];
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully removed the \`${criteria2}\` from the ${offer.name} offer!`,
                                author: message.author
                            });
                            break;
                        case "cars":
                            let query = args.slice(3, args.length).map(i => i.toLowerCase());
                            await new Promise(resolve => resolve(search(message, query, offer.offer.cars, "car")))
                                .then(async (response) => {
                                    if (!Array.isArray(response)) {
                                        operationFailed = true;
                                    }
                                    else {
                                        let [carFile, currentMessage2] = response;
                                        currentMessage = currentMessage2;
                                        offer.offer.cars.splice([carFile], 1);
                                        if (offer.offer.cars.length < 1) {
                                            delete offer.offer.cars;
                                        }

                                        let list = "";
                                        for (let i = 0; i < offer.offer.cars.length; i++) {
                                            let car = getCar(offer.offer.cars[i]);
                                            list += `${carNameGen({ currentCar: car, rarity: true })}\n`;
                                        }

                                        let currentCar = getCar(carFile);
                                        successMessage = new SuccessMessage({
                                            channel: message.channel,
                                            title: `Successfully removed 1 ${carNameGen({ currentCar })} from the ${offer.name} offer!`,
                                            author: message.author,
                                            fields: [{ name: "Current Cars", value: list }],
                                            image: currentCar["racehud"]
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
                                title: "Error, offer editing criteria not found.",
                                desc: `Here is a list of offer editing criterias. 
                                \`pack\` - Sets a pack to the offer bundle. Provide the name of a pack after that.
                                \`cars\` - Adds a car to the offer bundle. Provide the name of a car after that.
                                \`fusetokens\` - Sets a certain amount of fuse tokens to the offer bundle. Provide the amount of fuse tokens after that.`,
                                author: message.author
                            }).displayClosest(criteria2);
                            errorMessage.sendMessage({ currentMessage });
                    }
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, offer editing criteria not found.",
                        desc: `Here is a list of offer editing criterias. 
                        \`name\` - The name of the offer. 
                        \`duration\` - How long the offer goes live for.
                        \`extend\` - How long an offer is going to be extended by (in hours). 
                        \`price\` - How much the offer is charged for.
                        \`stock\` - Te available stock of the offer. 
                        \`addcontent\` - Adds something to the offer bundle.
                        \`removecontent\` - Removes something from the offer bundle.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
            }

            if (!operationFailed) {
                await offerModel.updateOne({ offerID: offer.offerID }, offer);
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};