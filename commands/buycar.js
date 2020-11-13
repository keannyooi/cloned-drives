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
    name: "buycar",
    usage: "<car name goes here> or <catalog number> (optional) <amount>",
    args: true,
    adminOnly: false,
    description: "Buy a car from the dealership using this command!",
    async execute(message, args) {
        var carName = args[0].toLowerCase();
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const catalog = await db.get("dealershipCatalog");
        const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
        const searchResults = [];
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        var amount = args[args.length - 1];
        if (isNaN(amount) || !isNaN(carName) || carName > 8) {
            amount = 1;
        }

        if (isNaN(carName)) {
            for (i = 1; i < args.length - 1; i++) {
                carName += (" " + args[i].toLowerCase());
            }
        }
        else {
            if (carName > 0 && carName < 9) {
                const currentCar = require(`./cars/${catalog[carName - 1].carFile}`);
                carName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            }
            else {
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, catalog number requested invalid.")
                    .setDescription("The catalog number must be between 1 and 8.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
            }
        }

        var counter = 0;
        var searched = 0;
        while (counter < catalog.length) {
            var currentCar = require(`./cars/${catalog[counter].carFile}`);
            var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            if (currentName.includes(carName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = catalog[counter];
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentCar = searchResults[0];
            console.log(currentCar);
            if (searched > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    const currentCar = require(`./cars/${searchResults[i - 1].carFile}`);
                    carList += `${i} - ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ")\n";
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
                        time: waitTime,
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
                                currentCar = searchResults[parseInt(collected.first()) - 1];
                                collected.first().delete();
                                buyCar(currentCar, amount, currentMessage);
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
            else {
                buyCar(currentCar, amount);
            }
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, car requested not found.")
                .setDescription("Well that sucks.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function buyCar(currentCar, amount, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
            if (playerData.money >= (currentCar.price * amount)) {
                const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]})`;
                var i = 0;
                while (i < amount) {
                    playerData.garage.push({ carFile: `${currentName.toLowerCase()}.json`, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
                    i++;
                }
                playerData.money -= (currentCar.price * amount);
                await db.set(`acc${message.author.id}`, playerData);

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`Successfully bought ${amount} ${currentName}!`)
                    .setImage(car["card"])
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(infoScreen);
                }
                else {
                    return message.channel.send(infoScreen);
                }
            }
            else {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, it looks like you don't have enough money for this purchase.")
                    .addFields(
                        { name: "Required Amount of Money", value: `${moneyEmoji}${currentCar.price * amount}`, inline: true },
                        { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money}`, inline: true }
                    )
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                }
                else {
                    return message.channel.send(errorMessage);
                }
            }
        }
    }
}