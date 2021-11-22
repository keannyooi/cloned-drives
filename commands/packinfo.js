"use strict";

const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith('.json'));
const { InfoMessage } = require("./sharedfiles/classes.js");
const { search } = require("./sharedfiles/secondary.js");
const bot = require("../config.js");

module.exports = {
    name: "packinfo",
    aliases: ["pinfo"],
    usage: "<pack name goes here>",
    args: 1,
    category: "Configuration",
    description: "Shows info about a specified card pack.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase()), searchBy = "pack";
        if (args[0].toLowerCase() === "random") {
            return displayInfo(packFiles[Math.floor(Math.random() * packFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-p")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        new Promise(resolve => resolve(search(message, query, packFiles, searchBy)))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                try {
                    displayInfo(result, currentMessage);
                }
                catch (error) {
                    throw error;
                }
            });

        function displayInfo(pack, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get("726017235826770021");
            let currentPack = require(`./packs/${pack}`);
            let infoMessage = new InfoMessage({
                channel: message.channel,
                title: currentPack["packName"],
                desc: `ID: \`${pack.slice(0, 6)}\``,
                author: message.author,
                image: currentPack["pack"],
                fields: [
                    { name: "Price", value: currentPack["price"] ? `${moneyEmoji}${currentPack["price"]}` : "Not Purchasable" },
                    { name: "Description", value: currentPack["description"] }
                ]
            });

            for (let i = 0; i < currentPack["packSequence"].length; i++) {
                let dropRate = "`";
                for (let rarity of Object.keys(currentPack["packSequence"][i])) {
                    dropRate += `${rarity}: ${currentPack["packSequence"][i][rarity]}%\n`;
                }
                dropRate += "`";
                infoMessage.addFields([{
                    name: `Card(s) ${currentPack["repetition"] > 1 ? `${i * 5 + 1}~${(i + 1) * 5}` : (i + 1)} Drop Rate`,
                    value: dropRate,
                    inline: true
                }]);
            }
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};