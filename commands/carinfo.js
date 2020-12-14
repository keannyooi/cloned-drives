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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));

module.exports = {
    name: "carinfo",
    aliases: ["cinfo"],
    usage: "<car name goes here>",
    args: 1,
    adminOnly: false,
    description: "Shows info about a specified car.",
    execute(message, args) {
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        var carName = args.map(i => i.toLowerCase());

        const searchResults = carFiles.filter(function (carFile) {
            return carName.every(part => carFile.includes(part));
        });

        if (searchResults.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                const car = require(`./cars/${searchResults[i - 1]}`);
                carList += `${i} - ${car["make"]} ${car["model"]} (${car["modelYear"]})\n`;
            }

            if (carList.length > 2048) {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
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
                            const currentCar = require(`./cars/${searchResults[parseInt(collected.first()) - 1]}`);
                            collected.first().delete();
                            displayInfo(currentCar, currentMessage);
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
            const currentCar = require(`./cars/${searchResults[0]}`);
            displayInfo(currentCar);
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

        function displayInfo(currentCar, currentMessage) {
            var rarity;
            if (currentCar["rq"] > 79) { //leggie
                rarity = message.client.emojis.cache.get("726025494138454097");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                rarity = message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                rarity = message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                rarity = message.client.emojis.cache.get("726025394104434759");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                rarity = message.client.emojis.cache.get("726025302656024586");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                rarity = message.client.emojis.cache.get("726025273421725756");
            }
            else { //common
                rarity = message.client.emojis.cache.get("726020544264273928");
            }

            var tags = "", description, mra, ola, accel;
            if (currentCar["tags"].length) {
                for (i = 0; i < currentCar["tags"].length; i++) {
                    tags += `${currentCar["tags"][i]}, `;
                }
            }
            else {
                tags = "None";
            }
            if (currentCar["description"].length > 0) {
                description = currentCar["description"];
            }
            else {
                description = "None";
            }
            if (currentCar["topSpeed"] >= 100) {
                mra = currentCar["mra"];
            }
            else {
                mra = "N/A";
            }
            if (currentCar["topSpeed"] >= 60) {
                ola = currentCar["ola"];
                accel = currentCar["0to60"]
            }
            else {
                ola = accel = "N/A";
            }

            const maxedTunes = [996, 969, 699].filter(function (tune) {
                return currentCar[`${tune}TopSpeed`];
            });

            var currentName = `${currentCar["make"]} ${currentCar["model"]} (${currentCar["modelYear"]})`;
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`(${rarity} ${currentCar["rq"]}) ` + currentName)
                .setDescription("Stats of requested car:")
                .addFields(
                    { name: "Top Speed (MPH)", value: currentCar["topSpeed"], inline: true },
                    { name: "0-60MPH", value: accel, inline: true },
                    { name: "Handling", value: currentCar["handling"], inline: true },
                    { name: "Drive Type", value: currentCar["driveType"], inline: true },
                    { name: "Tyre Type", value: currentCar["tyreType"], inline: true },
                    { name: "Weight (kg)", value: currentCar["weight"], inline: true },
                    { name: "Ground Clearance", value: currentCar["gc"], inline: true },
                    { name: "Seat Count", value: currentCar["seatCount"], inline: true },
                    { name: "Body Style", value: currentCar["bodyStyle"], inline: true },
                    { name: "Engine Position", value: currentCar["enginePos"], inline: true },
                    { name: "Fuel Type", value: currentCar["fuelType"], inline: true },
                    { name: "TCS Enabled?", value: currentCar["tcs"], inline: true },
                    { name: "ABS Enabled?", value: currentCar["abs"], inline: true },
                    { name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
                    { name: "Off-the-Line Acceleration (OLA)", value: ola, inline: true },
                    { name: "Tags", value: tags.slice(0, -2), inline: true },
                    { name: "Prize Car?", value: currentCar["isPrize"], inline: true },
                    { name: "Available Maxed Tunes", value: maxedTunes.join(", "), inline: true },
                    { name: "Description", value: description },
                )
                .setImage(currentCar["card"])
                .setTimestamp();
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            }
            else {
                return message.channel.send(infoScreen);
            }
        }
    }
}