"use strict";
/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   /
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");
const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith('.json'));
const stringSimilarity = require("string-similarity");
module.exports = {
    name: "packinfo",
    aliases: ["pinfo"],
    usage: "<pack name goes here>",
    args: 1,
    category: "Configuration",
    description: "Shows info about a specified card pack.",
    execute(message, args) {
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        let packName = args.map(i => i.toLowerCase());
        const searchResults = packFiles.filter(function (packFile) {
            return packName.every(part => packFile.includes(part));
        });
        if (searchResults.length > 1) {
            let packList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let pack = require(`./packs/${searchResults[i - 1]}`);
                packList += `${i} - ${pack["packName"]}\n`;
            }
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple packs found, please type one of the following.")
                .setDescription(packList)
                .setTimestamp();
            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: waitTime,
                    errors: ["time"]
                })
                    .then(collected => {
                    if (message.channel.type === "text") {
                        collected.first().delete();
                    }
                    if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, invalid integer provided.")
                            .setDescription("It looks like your response was either not a number or not part of the selection.")
                            .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                            .setTimestamp();
                        return currentMessage.edit(errorMessage);
                    }
                    else {
                        let currentPack = require(`./packs/${searchResults[parseInt(collected.first().content) - 1]}`);
                        displayInfo(currentPack, currentMessage);
                    }
                })
                    .catch(() => {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return currentMessage.edit(cancelMessage);
                });
            });
        }
        else if (searchResults.length > 0) {
            let currentPack = require(`./packs/${searchResults[0]}`);
            displayInfo(currentPack);
        }
        else {
            let matches = stringSimilarity.findBestMatch(packName.join(" "), packFiles.map(i => i.slice(0, -5)));
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, pack requested not found.")
                .setDescription("Well that sucks.")
                .addField("Keywords Received", `\`${packName.join(" ")}\``, true)
                .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        function displayInfo(currentPack, currentMessage) {
            const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
            let priceString = "Not Purchasable";
            if (currentPack["limited"] === false) {
                priceString = `${moneyEmoji}${currentPack["price"]}`;
            }
            let infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(currentPack["packName"])
                .setDescription("Stats of requested pack:")
                .addFields({ name: "Price", value: `${priceString}` }, { name: "Description", value: currentPack["description"] })
                .setImage(currentPack["pack"])
                .setTimestamp();
            let dropRate;
            for (i = 0; i < currentPack["packSequence"].length; i++) {
                dropRate = "`";
                for (let rarity of Object.keys(currentPack["packSequence"][i])) {
                    dropRate += `${rarity}: ${currentPack["packSequence"][i][rarity]}%\n`;
                }
                dropRate += "`";
                infoScreen.addField(`Card ${i + 1} Drop Rate`, dropRate, true);
            }
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            }
            else {
                return message.channel.send(infoScreen);
            }
        }
    }
};
//# sourceMappingURL=packinfo.js.map