"use strict";

const bot = require("../config/config.js");
const { sandboxRoleID } = require("../util/consts/consts.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { modifiedBase } = require("../util/functions/cardType.js");
const addCars = require("../util/functions/addCars.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const { trackMoneySpent, trackTrophiesSpent, trackCarsBought } = require("../util/functions/tracker.js");
const { getProfile } = require("../util/functions/profileCache.js");
const { saveGarage } = require("../util/functions/garageWrite.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "buycar",
	aliases: ["buycat"],
    usage: ["<deal/bm> <car name>", "<deal/bm> <amount> <car name>"],
    args: 2,
    category: "Gameplay",
    description: "Buy a car from either the dealership or the black market using this command!",
	
    async execute(message, args) {
        // The member, the two catalogs and the profile are independent reads:
        // start them together. The no-op catch stops an unhandled rejection
        // when an early error return never awaits the profile.
        const profilePromise = getProfile(message.author.id);
        profilePromise.catch(() => {});
        const [guildMember, { dealershipCatalog, bmCatalog }] = await Promise.all([
            bot.homeGuild.members.fetch(message.author.id),
            serverStatModel.findOne({}, { dealershipCatalog: 1, bmCatalog: 1 }).lean()
        ]);
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
                    desc: "You may only chose between `deal` (dealership) and `bm` (black market).",
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
            const playerData = await profilePromise;
            const { money, trophies, garage } = playerData;
            const car = getCar(currentCar.carID);
            const price = currentCar.price * amount;
            let balance = mode === "bm" ? trophies : money;

            const bmReference = modifiedBase(car);
            if (mode === "bm" && !garage.find(c => c.carID === bmReference.carID)) {
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
			else if (guildMember.roles.cache.has(sandboxRoleID)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you may not buy cars on a sandbox alt.",
                    desc: `The commnad you are trying to use is not a available for accounts with the <@&${sandboxRoleID}> role.`,
                    author: message.author,
                });
                return errorMessage.sendMessage();
            }
            else if (balance >= price && currentCar.stock >= amount && await completePurchase(playerData, currentCar, amount, price)) {
                balance -= price;
                currentCar.stock -= amount;

                if (mode === "bm") trackTrophiesSpent(price);
                else trackMoneySpent(price);
                trackCarsBought(mode, amount);

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought ${amount} ${carNameGen({ currentCar: car, removeBMTag: true })} for ${emoji}${price}!`,
                    author: message.author,
                    image: car["racehud"],
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

        /**
         * Take the stock, then charge the player and add the cars. Returns
         * false (nothing changed) when the stock or the balance no longer
         * covers it, which shows the usual "unable to purchase" error.
         */
        async function completePurchase(playerData, currentCar, amount, price) {
            // Reserve first, guarded and positional on the ONE catalog entry: the
            // old wholesale rewrite of both catalogs could oversell to concurrent
            // buyers and clobber a dealership refresh made since the read.
            const catalog = mode === "bm" ? "bmCatalog" : "dealershipCatalog";
            const reserved = await serverStatModel.updateOne(
                { [catalog]: { "$elemMatch": { carID: currentCar.carID, stock: { "$gte": amount } } } },
                { "$inc": { [`${catalog}.$.stock`]: -amount } }
            );
            if (reserved.matchedCount === 0) return false;
            const release = () => serverStatModel.updateOne(
                { [`${catalog}.carID`]: currentCar.carID },
                { "$inc": { [`${catalog}.$.stock`]: amount } }
            );

            let addedCars = [];
            for (let i = 0; i < amount; i++) {
                addedCars.push({ carID: currentCar.carID, upgrade: "000" });
            }
            const currency = mode === "bm" ? "trophies" : "money";
            const before = structuredClone(playerData.garage);
            let saved;
            try {
                saved = await saveGarage({
                    userID: message.author.id,
                    before,
                    after: addCars(playerData.garage, addedCars),
                    inc: { [currency]: -price },
                    filter: { [currency]: { "$gte": price } },
                    baseStamp: playerData.cacheStamp
                });
            }
            catch (error) {
                await release().catch(() => {});
                throw error;
            }
            if (!saved.ok) await release().catch(error => console.error("[buycar] stock release failed:", error.message));
            return saved.ok;
        }
    }
};
