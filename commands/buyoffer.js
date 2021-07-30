/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");
const {
    DateTime,
    Interval
} = require("luxon");

module.exports = {
    name: "buyoffer",
    usage: "<offer name>",
    args: 1,
    category: "Gameplay",
    cooldown: 4.388,
    description: "Buy limited offers with this command!",
    async execute(message, args) {
        const db = message.client.db;
        const offers = await db.get("limitedOffers");
        const filter = response => {
            return response.author.id === message.author.id;
        };

        let offerName = args.map(i => i.toLowerCase());
        const searchResults = offers.filter(function(offer) {
            return offerName.every(part => offer.name.toLowerCase().includes(part)) && (offer.isActive === true || message.member.roles.cache.has("802043346951340064"));
        });

        if (searchResults.length > 1) {
            let offerList = "";
            for (i = 1; i <= searchResults.length; i++) {
                offerList += `${i} - ${searchResults[i - 1].name}\n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Multiple offers found, please type one of the following.")
                .setDescription(offerList)
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
                                .addField("Value Received", `\`${collected.first().content}\``)
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        } else {
                            buyOffer(searchResults[parseInt(collected.first().content) - 1], currentMessage);
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
            buyOffer(searchResults[0]);
        } else {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, offer requested not found.")
                .setDescription("Well that sucks.")
                .addField("Keywords Received", `\`${offerName.join(" ")}\``)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function buyOffer(offer, currentMessage) {
            const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
            const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
            const playerData = await db.get(`acc${message.author.id}`);

            if (offer.isActive === true && offer.timeLeft !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offer.deadline)).invalid !== null) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Looks like this offer has ended.")
                    .setDescription("Well that's too bad.")
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                } else {
                    return message.channel.send(errorMessage);
                }
            } else if (offer.players[message.author.id] >= offer.amount) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Error, this offer has run out.")
                    .setDescription(`You can only buy this offer ${offer.amount} times.`)
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                } else {
                    return message.channel.send(errorMessage);
                }
            }

            if (playerData.money >= offer.price) {
                playerData.money -= offer.price;
                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle(`Successfully bought the ${offer.name} offer!`)
                    .setTimestamp();

                for (let [key, value] of Object.entries(offer.offer)) {
                    switch (key) {
                        case "fuseTokens":
                            playerData.fuseTokens += value;
                            infoScreen.addField("Claimed Fuse Tokens", `${fuseEmoji}${value}`, true);
                            break;
                        case "cars":
                            let carList = "";
                            for (let i = 0; i < value.length; i++) {
                                let isInGarage = playerData.garage.findIndex(garageCar => {
                                    return garageCar.carFile === value[i];
                                });
                                if (isInGarage !== -1) {
                                    playerData.garage[isInGarage]["000"]++;
                                } else {
                                    playerData.garage.push({
                                        carFile: value[i],
                                        "000": 1,
                                        "333": 0,
                                        "666": 0,
                                        "996": 0,
                                        "969": 0,
                                        "699": 0,
                                    });
                                }

                                let currentCar = require(`./cars/${value[i]}`);
                                let rarity = rarityCheck(currentCar);
                                let make = currentCar["make"];
                                if (typeof make === "object") {
                                    make = currentCar["make"][0];
                                }
                                carList += `(${rarity} ${currentCar["rq"]}) ${make} ${currentCar["model"]} (${currentCar["modelYear"]})\n`;
                            }
                            infoScreen.addField("Claimed Cars", carList);
                            break;
                        case "pack":
                            const openPackCommand = require("./sharedfiles/openpack.js");
                            let currentPack = require(`./packs/${value}`);
                            let addedCars = openPackCommand.openPack(message, currentPack);

                            for (let x = 0; x < addedCars.length; x++) {
                                let isInGarage = playerData.garage.findIndex(garageCar => {
                                    return garageCar.carFile === addedCars[x];
                                });
                                if (isInGarage !== -1) {
                                    playerData.garage[isInGarage]["000"] += 1;
                                } else {
                                    playerData.garage.push({
                                        carFile: addedCars[x],
                                        "000": 1,
                                        "333": 0,
                                        "666": 0,
                                        "996": 0,
                                        "969": 0,
                                        "699": 0,
                                    });
                                }
                            }
                            infoScreen.addField("Claimed Pack", currentPack["packName"]);
                            break;
                        default:
                            break;
                    }
                }

                if (offer.players[message.author.id]) {
                    offer.players[message.author.id]++;
                } else {
                    offer.players[message.author.id] = 1;
                }

                await db.set("limitedOffers", offers);
                await db.set(`acc${message.author.id}`, playerData);
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                if (currentMessage) {
                    return currentMessage.edit(infoScreen);
                } else {
                    return message.channel.send(infoScreen);
                }
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
                        value: `${moneyEmoji}${offer.price}`,
                        inline: true
                    }, {
                        name: "Your Money Balance",
                        value: `${moneyEmoji}${playerData.money}`,
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

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("857512942471479337");
            } else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            } else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            } else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("857513197937623042");
            } else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.client.emojis.cache.get("726025302656024586");
            } else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.client.emojis.cache.get("726025273421725756");
            } else { //common
                return message.client.emojis.cache.get("726020544264273928");
            }
        }
    }
}