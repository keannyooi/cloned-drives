"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "buycar",
    usage: ["<deal/bm> <car name>", "<deal/bm> <amount> <car name>"],
    args: 2,
    category: "Gameplay",
    description: "Buy a car from either the dealership or the black market using this command!",
    async execute(message, args) {
        const { dealershipCatalog, bmCatalog } = await serverStatModel.findOne({});
        let query, list, mode = args[0].toLowerCase();
        let amount = 1;
        if (isNaN(args[1]) || !args[2]) {
            query = args.slice(1, args.length).map(i => i.toLowerCase());
        }
        else {
            amount = Math.ceil(parseInt(args[1]));
            query = args.slice(2, args.length).map(i => i.toLowerCase());
        }
        if (amount < 1 || amount > 10) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, amount provided is invalid.",
                desc: "The amount of cars added must be a positive number not more than `10`.",
                author: message.author
            }).displayClosest(amount.toLocaleString("en"));
            return errorMessage.sendMessage();
        }
        switch (mode) {
            case "deal":
                list = dealershipCatalog;
                break;
            case "bm":
                list = bmCatalog;
                break;
            default:
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, shop selection provided is invalid.",
                    desc: "ou may only chose between `deal` (dealership) and `bm` (black market).",
                    author: message.author
                }).displayClosest(mode);
                return errorMessage.sendMessage();
        }

        await new Promise(resolve => resolve(search(message, query, list, "dealership")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [currentCar, currentMessage] = response;
                await buyCar(currentCar, amount, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function buyCar(currentCar, amount, currentMessage) {
            const emoji = bot.emojis.cache.get(mode === "bm" ? trophyEmojiID : moneyEmojiID);
            const { money, trophies, garage } = await profileModel.findOne({ userID: message.author.id });
            const car = require(`../cars/${currentCar.carID}`);
            const price = currentCar.price * amount;
            let balance = mode === "bm" ? trophies : money;

            if (mode === "bm" && !garage.find(c => c.carID === car["reference"])) {
                let bmReference = require(`../cars/${car["reference"]}`);
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, unable to purchase car.",
                    desc: "You are trying to buy a car from the Black Market that you don't own in its original variant.",
                    author: message.author,
                    fields: [
                        { name: "Car Required", value: carNameGen({ currentCar: bmReference, rarity: true }), inline: true },
                    ]
                });
                return errorMessage.sendMessage({ currentMessage });
            }
            else if (balance >= price && currentCar.stock >= amount) {
                let addedCars = [];
                for (let i = 0; i < amount; i++) {
                    addedCars.push({ carID: currentCar.carID, upgrade: "000" });
                }
                balance -= price;
                currentCar.stock -= amount;

                const obj = mode === "bm" ? { trophies: balance } : { money: balance };
                obj.garage = addCars(garage, addedCars);
                await Promise.all([
                    profileModel.updateOne({ userID: message.author.id }, obj),
                    serverStatModel.updateOne({}, { dealershipCatalog, bmCatalog })
                ]);

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought ${amount} ${carNameGen({ currentCar: car, removeBMTag: true })} for ${emoji}${price}!`,
                    author: message.author,
                    image: car["card"],
                    fields: [
                        { name: "Current Balance", value: `${emoji}${balance.toLocaleString("en")}` }
                    ]
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, unable to purchase car.",
                    desc: `This may happen either ecause you don't have enough ${mode === "bm" ? "trophies" : "money"} for this purchase or the car you are trying to buy has insufficient supply.`,
                    author: message.author,
                    fields: [
                        { name: `Required Amount of ${mode === "bm" ? "trophies" : "money"}`, value: `${emoji}${(currentCar.price * amount).toLocaleString("en")}`, inline: true },
                        { name: "Your Balance", value: `${emoji}${balance.toLocaleString("en")}`, inline: true },
                        { name: "Stock Remaining", value: currentCar.stock.toLocaleString("en"), inline: true }
                    ]
                });
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};