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
    args: true,
    adminOnly: false,
    description: "Shows info about a specified car.",
    execute(message, args) {
        var carName = args[0].toLowerCase();
        const searchResults = [];
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        for (i = 1; i < args.length; i++) {
            carName += (" " + args[i].toLowerCase());
        }
        var counter = 0;
        var searched = 0;
        while (counter < carFiles.length) {
            var currentCar = require(`./cars/${carFiles[counter]}`);
            var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            if (currentName.includes(carName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = currentCar;
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var rarity;
            var currentCar = searchResults[0];
            if (searched > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    carList += `${i} - ` + searchResults[i - 1]["make"] + " " + searchResults[i - 1]["model"] + " (" + searchResults[i - 1]["modelYear"] + ")\n";
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple cars found, please type one of the following.")
                    .setDescription(carList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(() => {
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
                                return message.channel.send(errorMessage);
                            }
                            else {
                                currentCar = searchResults[parseInt(collected.first()) - 1];
                                collected.first().delete();
                                displayInfo(currentCar);
                            }
                        })
                        .catch(() => {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled automatically.")
                                .setTimestamp();
                            return message.channel.send(cancelMessage);
                        });
                });
            }
            else {
                displayInfo(currentCar);
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

        function displayInfo(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "legendary");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "epic");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "ultrarare");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "superrare");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "rare");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "uncommon");
            }
            else { //common
                rarity = message.guild.emojis.cache.find(emoji => emoji.name === "common");
            }

            var tags;
            if (currentCar["tags"].length) {
                tags = currentCar["tags"][0];

                if (currentCar["tags"].length > 1) {
                    for (i = 1; i < currentCar["tags"].length; i++) {
                        tags += ", " + currentCar["tags"][i];
                    }
                }
            }
            else {
                tags = "None";
            }
            var description;
            if (currentCar["description"].length > 0) {
                description = currentCar["description"];
            }
            else {
                description = "None";
            }
            var mra;
            if (currentCar["topSpeed"] >= 100) {
                mra = currentCar["mra"];
            }
            else {
                mra = "N/A";
            }
            var ola;
            if (currentCar["topSpeed"] >= 60) {
                ola = currentCar["ola"];
            }
            else {
                ola = "N/A";
            }

            const maxedTunes = [996, 969, 699];
            var tunes = "";
            for (i = 0; i < maxedTunes.length; i++) {
                if (currentCar[`${maxedTunes[i]}MaxedTopSpeed`] && currentCar[`${maxedTunes[i]}Maxed0to60`] && currentCar[`${maxedTunes[i]}MaxedHandling`]) {
                    tunes += `${maxedTunes[i]}, `;
                }
            }

            var currentName = currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ")";
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`(${rarity} ${currentCar["rq"]}) ` + currentName)
                .setDescription("Stats of requested car:")
                .addFields(
                    { name: "Top Speed (MPH)", value: currentCar["topSpeed"], inline: true },
                    { name: "0-60MPH", value: currentCar["0to60"], inline: true },
                    { name: "Handling", value: currentCar["handling"], inline: true },
                    { name: "Drive Type", value: currentCar["driveType"], inline: true },
                    { name: "Tyre Type", value: currentCar["tyreType"], inline: true },
                    { name: "Weight (kg)", value: currentCar["weight"], inline: true },
                    { name: "Ground Clearance", value: currentCar["gc"], inline: true },
                    { name: "Seat Count", value: currentCar["seatCount"], inline: true },
                    { name: "Body Style", value: currentCar["bodyStyle"], inline: true },
                    { name: "Fuel Type", value: currentCar["fuelType"], inline: true },
                    { name: "TCS Enabled?", value: currentCar["tcs"], inline: true },
                    { name: "ABS Enabled?", value: currentCar["abs"], inline: true },
                    { name: "Mid-Range Acceleration (MRA)", value: mra, inline: true },
                    { name: "Off-the-Line Acceleration (OLA)", value: ola },
                )
                .addField("Tags", tags, true)
                .addField("Prize Car?", currentCar["isPrize"], true)
                .addField("Available Maxed Tunes", tunes.slice(0, -2), true)
                .addField("Description", description)
                .setImage(currentCar["card"])
                .setTimestamp();
            return message.channel.send(infoScreen);
        }
    }
}