const Discord = require("discord.js-light");

module.exports = {
    name: "sethand",
    usage: "<car name goes here>",
    args: true,
    adminOnly: false,
    description: "Sets your hand for quick race and random race gamemodes.",
    async execute(message, args) {
		const db = message.client.db;
        const garage = await db.get(`acc${message.author.id}.garage`);
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
        while (counter < garage.length) {
            var currentCar = require(`./cars/${garage[counter].carFile}`);
            var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            if (currentName.includes(carName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = garage[counter];
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentCar = searchResults[0];
            if (searched > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    const car = require(`./cars/${searchResults[i - 1].carFile}`);
                    carList += `${i} - ` + car["make"] + " " + car["model"] + " (" + car["modelYear"] + `) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple cars found, please type one of the following.")
                    .setDescription(carList);

                message.channel.send(infoScreen).then(() => {
                    message.channel.awaitMessages(filter, {
                        max: 1,
                        time: waitTime,
                        errors: ['time']
                    })
                        .then(collected => {
                            if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
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
                                setHand(currentCar);
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
                setHand(currentCar);
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

        async function setHand(currentCar) {
            const car = require(`./cars/${currentCar.carFile}`);
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]`;
            var racehud;
            console.log(currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade);

            switch (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) {
                case 0:
                    racehud = car["racehudStock"];
                    break;
                case 9:
                    racehud = car["racehud1Star"];
                    break;
                case 18:
                    racehud = car["racehud2Star"];
                    break;
                case 24:
                    racehud = car[`racehudMaxed${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`];
                    break;
                default:
                    break;
            }

            if (!racehud) {
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, the tuning stage you requested is not supported.")
                    .setDescription("There is a possiblity that the maxed tune your car has isn't available. If that's the case, report it to the devs.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
            }

            db.set(`acc${message.author.id}.hand`, { carFile: currentCar.carFile, gearingUpgrade: currentCar.gearingUpgrade, engineUpgrade: currentCar.engineUpgrade, chassisUpgrade: currentCar.chassisUpgrade });
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully set your ${currentName} as your quick race and random race hand!`)
                .setImage(racehud)
                .setTimestamp();
            return message.channel.send(infoScreen);
        }
    }
}