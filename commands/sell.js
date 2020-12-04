/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");

module.exports = {
    name: "sell",
    aliases: ["s"],
    usage: "<car name goes here>",
    description: "Sells a car from your garage.",
    args: 1,
    adminOnly: false,
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const garage = playerData.garage;

        var index = 0;
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (garage.length <= 5) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("HOLD ON RIGHT THERE!")
                .setDescription("You can't do anything without more than 5 cars. Please don't sell any more cars and build up your garage!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        var carName = args.map(i => i.toLowerCase());
        const searchResults = garage.filter(function (garageCar) {
            return carName.every(part => garageCar.carFile.includes(part));
        });

        if (searchResults.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                const car = require(`./cars/${searchResults[i - 1].carFile}`);
                carList += `${i} - ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
            }

            if (carList.length > 2048) {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                    .setTimestamp();
                return message.channel.send(errorMessage);;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple cars found, please type one of the following.")
                .setDescription(carList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
                    errors: ['time']
                })
                    .then(collected => {
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                            collected.first().delete();
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            let currentCar = searchResults[parseInt(collected.first()) - 1];
                            collected.first().delete();
                            sell(currentCar, currentMessage);
                        }
                    })
                    .catch(() => {
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
            sell(searchResults[0], index);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, it looks like you don't have that car.")
                .setDescription("oof")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function sell(currentCar, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]`;

            var money;
            if (car["rq"] > 79) { //leggie
                money = 200000 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 4500);
            }
            else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                money = 77500 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 3750);
            }
            else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                money = 27500 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 3000);
            }
            else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                money = 7500 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 2250);
            }
            else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                money = 1000 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 1500);
            }
            else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                money = 500 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 750);
            }
            else { //common
                money = 200 + ((currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) * 500);
            }

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to sell your ${currentName} for ${moneyEmoji}${money}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(car["card"])
                .setTimestamp();
            var reactionMessage;
            if (currentMessage) {
                reactionMessage = await currentMessage.edit(confirmationMessage);
            }
            else {
                reactionMessage = await message.channel.send(confirmationMessage);
            }
            reactionMessage.react("✅");
            reactionMessage.react("❎");
            reactionMessage.awaitReactions(emojiFilter, {
                max: 1,
                time: 10000,
                errors: ['time']
            })
                .then(async collected => {
                    reactionMessage.reactions.removeAll();
                    switch (collected.first().emoji.name) {
                        case "✅":
                            garage.splice(garage.indexOf(currentCar), 1);

                            if (playerData.hand) {
                                if (playerData.hand.carFile === currentCar.carFile) {
                                    playerData.hand = null;
                                }
                            }
                            var i = 0;
                            while (i < playerData.decks.length) {
                                const hasCar = playerData.decks[i].hand.find(function (car) {
                                    return car.carFile === currentCar.carFile;
                                });
                                if (hasCar) {
                                    console.log(hasCar);
                                    const index = playerData.decks[i].hand.indexOf(hasCar);
                                    playerData.decks[i].hand[index] = "None";
                                }
                                i++;
                            }
                            playerData.money += money;
                            await db.set(`acc${message.author.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully sold your ${currentName}!`)
                                .setDescription(`You earned ${moneyEmoji}${money}!`)
                                .addField("Your Money Balance", `${moneyEmoji}${playerData.money}`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setDescription(`Your ${currentName} stays in your garage.`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
                })
                .catch(() => {
                    reactionMessage.reactions.removeAll();
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setDescription(`Your ${currentName} stays in your garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}