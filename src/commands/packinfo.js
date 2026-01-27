"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const search = require("../util/functions/search.js");

module.exports = {
    name: "packinfo",
    aliases: ["pinfo"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Configuration",
    description: "Shows info about a specified card pack.",
    async execute(message, args) {
        const packFiles = getPackFiles();
        let query = args.map(i => i.toLowerCase()), searchBy = "pack";
        if (args[0].toLowerCase() === "random") {
            const randomFile = packFiles[Math.floor(Math.random() * packFiles.length)];
            const packId = randomFile.endsWith('.json') ? randomFile.slice(0, -5) : randomFile;
            return displayInfo(packId);
        }
        else if (args[0].toLowerCase().startsWith("-p")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, packFiles, searchBy)))
            .then(response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                const packId = result.endsWith('.json') ? result.slice(0, -5) : result;
                displayInfo(packId, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        function displayInfo(packId, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            let currentPack = getPack(packId);
            let infoMessage = new InfoMessage({
                channel: message.channel,
                title: currentPack["packName"],
                desc: `ID: \`${packId.slice(0, 6)}\``,
                author: message.author,
                image: currentPack["pack"],
                fields: [
                    { name: "Price", value: currentPack["price"] ? `${moneyEmoji}${currentPack["price"].toLocaleString("en")}` : "Not Purchasable" },
                    { name: "Description", value: currentPack["description"] }
                ]
            });

            const fields = [];
            for (let i = 0; i < currentPack["packSequence"].length; i++) {
                let dropRate = "`";
                for (let rarity of Object.keys(currentPack["packSequence"][i])) {
                    dropRate += `${rarity}: ${currentPack["packSequence"][i][rarity]}%\n`;
                }
                dropRate += "`";
				const cardRange = currentPack["repetition"] > 1 ? `${i * currentPack["repetition"] + 1}~${(i + 1) * currentPack["repetition"]}` : (i + 1);
				fields.push({
				name: `Card(s) ${cardRange} Drop Rate`,
				value: dropRate,
				inline: true
                });
            }
            infoMessage.editEmbed({ fields });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};
