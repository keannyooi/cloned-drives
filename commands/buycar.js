/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "buycar",
    usage: " (optional) <amount> | <car name goes here> ",
    args: 1,
    category: "Gameplay",
    description: "Buy a car from the dealership using this command!",
    async execute(message, args) {
        let carName;
        var amount = 1;
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const catalog = await db.get("dealershipCatalog");
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (isNaN(args[0]) || !args[1]) {
            carName = args.map(i => i.toLowerCase());
        } else {
            amount = Math.ceil(parseInt(args[0]));
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
        }

        if (amount > 10) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, you may not buy that many cars at once.")
                .setDescription("The maximum amount of cars that you can buy at once is limited to 10 in order to prevent something like this (https://discordapp.com/channels/711769157078876305/750304321832222811/781217938069782599).")
                .addField("Amount Received", `\`${amount}\``)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        const searchResults = catalog.filter(function(selection) {
            return carName.every(part => selection.carFile.includes(part));
        });
        if (searchResults.length > 1) {
            let carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let currentCar = require(`./cars/${searchResults[i - 1].carFile}`);
                carList += `${i} - ${currentCar["make"]} ${currentCar["model"]} (${currentCar["modelYear"]})\n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Multiple cars found, please type one of the following.")
                .setDescription(carList)
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
                            buyCar(searchResults[parseInt(collected.first().content) - 1], amount, currentMessage);
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
            let currentCar = searchResults[0];
            buyCar(currentCar, amount);
        } else {
            let matches = stringSimilarity.findBestMatch(carName.join(" "), catalog.map(i => i.carFile));
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, car requested not found.")
                .setDescription("Try checking the dealership again.")
                .addField("Keywords Received", `\`${carName.join(" ")}\``, true)
                .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function buyCar(currentCar, amount, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
            const price = currentCar.price * amount;
            if (playerData.money >= price && currentCar.stock >= amount) {
                const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]})`;
                let isInGarage = playerData.garage.findIndex(garageCar => {
                    return garageCar.carFile === `${currentCar.carFile}.json`;
                });
                if (isInGarage !== -1) {
                    playerData.garage[isInGarage]["000"] += amount;
                } else {
                    playerData.garage.push({
                        carFile: `${currentCar.carFile}.json`,
                        "000": amount,
                        "333": 0,
                        "666": 0,
                        "996": 0,
                        "969": 0,
                        "699": 0,
                    });
                }

                playerData.money -= price;
                catalog[catalog.indexOf(currentCar)].stock -= amount;
                await db.set(`acc${message.author.id}`, playerData);
                await db.set("dealershipCatalog", catalog);

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle(`Successfully bought ${amount} ${currentName} for ${moneyEmoji}${price}!`)
                    .setImage(car["card"])
                    .setTimestamp();
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
                    .setTitle("Error, it looks like you either don't have enough money for this purchase or the car you are trying to buy has insufficient supply.")
                    .addFields({
                        name: "Required Amount of Money",
                        value: `${moneyEmoji}${currentCar.price * amount}`,
                        inline: true
                    }, {
                        name: "Your Money Balance",
                        value: `${moneyEmoji}${playerData.money}`,
                        inline: true
                    }, {
                        name: "Stock Remaining",
                        value: currentCar.stock,
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