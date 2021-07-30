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
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "openpack",
    aliases: ["buypack", "op"],
    usage: "<pack name goes here>",
    args: 1,
    category: "Gameplay",
    cooldown: 4.388,
    description: "Opens a pack.",
    async execute(message, args) {
        const openPackCommand = require("./sharedfiles/openpack.js");
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const money = playerData.money;
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const filter = response => {
            return response.author.id === message.author.id;
        };

        let packName = args.map(i => i.toLowerCase());
        const searchResults = packFiles.filter(function(pack) {
            let checking = require(`./packs/${pack}`)
            return packName.every(part => pack.includes(part)) && checking["limited"] === false;
        });

        if (searchResults.length > 1) {
            let packList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let currentPack = require(`./packs/${searchResults[i - 1]}`);
                packList += `${i} - ${currentPack["packName"]}\n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Multiple packs found, please type one of the following.")
                .setDescription(packList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                        max: 1,
                        time: 30000,
                        errors: ["time"]
                    })
                    .then(collected => {
                        if (message.channel.type === "text") {
                            collected.first().delete();
                        }
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        } else {
                            let currentPack = require(`./packs/${searchResults[parseInt(collected.first().content) - 1]}`);
                            openPack(currentPack, money, currentMessage);
                        }
                    })
                    .catch(() => {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return currentMessage.edit(cancelMessage);
                    });
            });
        } else if (searchResults.length > 0) {
            let currentPack = require(`./packs/${searchResults[0]}`);
            openPack(currentPack, money);
        } else {
            let matches = stringSimilarity.findBestMatch(packName.join(" "), packFiles.map(i => i.slice(0, -5)));
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, pack requested not found.")
                .setDescription("Well that sucks.")
                .addField("Keywords Received", `\`${packName.join(" ")}\``, true)
                .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function openPack(currentPack, money, currentMessage) {
            if (money >= currentPack["price"]) {
                playerData.money -= currentPack["price"];
                let addedCars = openPackCommand.openPack(message, currentPack);

                for (i = 0; i < addedCars.length; i++) {
                    let isInGarage = playerData.garage.findIndex(garageCar => {
                        return garageCar.carFile === addedCars[i];
                    });
                    if (isInGarage !== -1) {
                        playerData.garage[isInGarage]["000"] += 1;
                    } else {
                        playerData.garage.push({
                            carFile: addedCars[i],
                            "000": 1,
                            "333": 0,
                            "666": 0,
                            "996": 0,
                            "969": 0,
                            "699": 0,
                        });
                    }
                }
                await db.set(`acc${message.author.id}`, playerData);
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            } else {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Error, it looks like you don't have enough money for this purchase.")
                    .addFields({
                        name: "Required Amount of Money",
                        value: `${moneyEmoji}${currentPack["price"]}`,
                        inline: true
                    }, {
                        name: "Your Money Balance",
                        value: `${moneyEmoji}${money}`,
                        inline: true
                    })
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                } else {
                    return message.channel.send(errorMessage);
                }
            }
        }
    }
}