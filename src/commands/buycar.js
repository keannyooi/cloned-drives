"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "buycar",
    usage: ["<car name>", "<amount> <car name>"],
    args: 1,
    category: "Gameplay",
    description: "Buy a car from the dealership using this command!",
    async execute(message, args) {
        const { dealershipCatalog } = await serverStatModel.findOne({});
        let query;
        let amount = 1;
        if (isNaN(args[0]) || !args[1]) {
            query = args.map(i => i.toLowerCase());
        }
        else {
            amount = Math.ceil(parseInt(args[0]));
            query = args.slice(1, args.length).map(i => i.toLowerCase());
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

        await new Promise(resolve => resolve(search(message, query, dealershipCatalog, "dealership")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [currentCar, currentMessage] = response;
                await buyCar(currentCar, amount, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function buyCar(currentCar, amount, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const { money, garage } = await profileModel.findOne({ userID: message.author.id });
            const car = require(`../cars/${currentCar.carID}`);
            const price = currentCar.price * amount;
            if (money >= price && currentCar.stock >= amount) {
                let addedCars = [];
                for (let i = 0; i < amount; i++) {
                    addedCars.push({ carID: currentCar.carID, upgrade: "000" });
                }
                let balance = money - price;
                currentCar.stock -= amount;

                await Promise.all([
                    profileModel.updateOne({ userID: message.author.id }, {
                        money: balance,
                        garage: addCars(garage, addedCars)
                    }),
                    serverStatModel.updateOne({}, { dealershipCatalog })
                ]);

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought ${amount} ${carNameGen({ currentCar: car })} for ${moneyEmoji}${price}!`,
                    author: message.author,
                    image: car["card"],
                    fields: [
                        { name: "Current Money Balance", value: `${moneyEmoji}${balance.toLocaleString("en")}` }
                    ]
                });
                return successMessage.sendMessage({ currentMessage });
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, unable to purchase car.",
                    desc: "It looks like you either don't have enough money for this purchase or the car you are trying to buy has insufficient supply.",
                    author: message.author,
                    fields: [
                        { name: "Required Amount of Money", value: `${moneyEmoji}${(currentCar.price * amount).toLocaleString("en")}`, inline: true }, { name: "Your Money Balance", value: `${moneyEmoji}${money.toLocaleString("en")}`, inline: true },
                        { name: "Stock Remaining", value: currentCar.stock.toLocaleString("en"), inline: true }
                    ]
                });
                return errorMessage.sendMessage({ currentMessage });
            }
        }
    }
};