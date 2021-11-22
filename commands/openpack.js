"use strict";

const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const { addCars } = require("./sharedfiles/primary.js");
const { search, openPack } = require("./sharedfiles/secondary.js");
const { ErrorMessage } = require("./sharedfiles/classes.js");
const profileModel = require("../models/profileSchema.js");
const bot = require("../config.js");

module.exports = {
    name: "openpack",
    aliases: ["buypack", "op"],
    usage: "<pack name goes here>",
    args: 1,
    category: "Gameplay",
    cooldown: 4.388,
    description: "Opens a pack.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase());
        let packs = packFiles.filter(pack => {
            let contents = require(`./packs/${pack}`);
            return contents["price"];
        });

        new Promise(resolve => resolve(search(message, query, packs, "pack")))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                try {
                    const playerData = await profileModel.findOne({ userID: message.author.id });
                    const moneyEmoji = bot.emojis.cache.get("726017235826770021");
                    let currentPack = require(`./packs/${result}`);
                    if (playerData.money >= currentPack["price"]) {
                        let addedCars = openPack(message, currentPack, currentMessage);
                        if (!Array.isArray(addedCars)) return;
                        await profileModel.updateOne({ userID: message.author.id }, {
                            money: playerData.money - currentPack["price"],
                            garage: addCars(playerData.garage, addedCars)
                        });
                    }
                    else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, it looks like you don't have enough money for this purchase.",
                            author: message.author,
                            fields: [
                                { name: "Required Amount of Money", value: `${moneyEmoji}${currentPack["price"]}`, inline: true },
                                { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money}`, inline: true }
                            ]
                        });
                        return errorMessage.sendMessage({ currentMessage });
                    }
                }
                catch (error) {
                    throw error;
                }
            });
    }
};