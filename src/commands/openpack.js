"use strict";

const bot = require("../config/config.js");
const { readdirSync } = require("fs");
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "openpack",
    aliases: ["buypack", "op"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Gameplay",
    cooldown: 5,
    description: "Opens a pack.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase());
        let packs = packFiles.filter(pack => {
            let contents = require(`../packs/${pack}`);
            return contents["price"];
        });

        await new Promise(resolve => resolve(search(message, query, packs, "pack")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                const { money, garage } = await profileModel.findOne({ userID: message.author.id });
                const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
                let currentPack = require(`../packs/${result}`);
                if (money >= currentPack["price"]) {
                    let addedCars = openPack(message, currentPack, currentMessage);
                    if (!Array.isArray(addedCars)) return;
                    await profileModel.updateOne({ userID: message.author.id }, {
                        "$inc": {
                            money: currentPack["price"] * -1
                        },
                        garage: addCars(garage, addedCars)
                    });
                }
                else {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, it looks like you don't have enough money for this purchase.",
                        author: message.author,
                        fields: [
                            { name: "Required Amount of Money", value: `${moneyEmoji}${currentPack["price"].toLocaleString("en")}`, inline: true },
                            { name: "Your Money Balance", value: `${moneyEmoji}${money.toLocaleString("en")}`, inline: true }
                        ]
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }
            })
            .catch(error => {
                throw error;
            });
    }
};