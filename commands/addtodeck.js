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
    name: "addtodeck",
    usage: "<deck name goes here> <index> <car name goes here>",
    args: 3,
	isExternal: true,
    adminOnly: false,
    description: 'Adds (or replaces) a car to a specified slot in a specifed deck. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        if (!args[1] || !args[2]) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, arguments provided insufficient.")
                .setDescription("Correct syntax: `cd-addtodeck <deck name goes here> <index> <car name goes here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const decks = playerData.decks;
        const deckName = args[0].toLowerCase();
        const index = args[1];
        if (isNaN(index) || index > 5 || index < 1) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, index provided is invalid or not a number.")
                .setDescription("Indexes must be a number and must be between 1 to 5.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        const searchResults = [];
        const filter = response => {
            return response.author.id === message.author.id;
        };
        var carName = args[2].toLowerCase();
        for (i = 3; i < args.length; i++) {
            carName += (" " + args[i].toLowerCase());
        }

        var counter = 0;
        var searched = 0;
        while (counter < decks.length) {
            var currentName = decks[counter].name.toLowerCase();
            if (currentName.includes(deckName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = decks[counter];
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentDeck = searchResults[0];
            if (searched > 1) {
                var deckList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    deckList += `${i} - ${searchResults[i - 1].name} \n`;
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple decks found, please type one of the following.")
                    .setDescription(deckList)
                    .setTimestamp();

                const currentMessage = await message.channel.send(infoScreen);
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
                            currentDeck = searchResults[parseInt(collected.first()) - 1];
                            collected.first().delete();
                            checkCar(currentDeck, currentMessage);
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
            }
            else {
                checkCar(currentDeck);
            }
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 deck not found.")
                .setDescription(`It looks like you don't have a deck named \`${deckName}\`.`)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function checkCar(currentDeck, currentMessage) {
            const garage = playerData.garage.filter(function (garageCar) {
                let upgrade = `${garageCar.gearingUpgrade}${garageCar.gearingUpgrade}${garageCar.gearingUpgrade}`
                let find = currentDeck.hand.find(function (deckCar) {
                    let currentUpgrade = `${deckCar.gearingUpgrade}${deckCar.gearingUpgrade}${deckCar.gearingUpgrade}`
                    return deckCar.carFile === garageCar.carFile && upgrade === currentUpgrade;
                });
                return find === undefined;
            });

            var carName = args.slice(1, args.length).map(i => i.toLowerCase());
            const searchResults = garage.filter(function (garageCar) {
                return carName.every(part => garageCar.carFile.includes(part));
            });

            if (searchResults.length > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    let car = require(`./cars/${searchResults[i - 1].carFile}`);
					let make = car["make"];
					if (typeof make === "object") {
						make = car["make"][0];
					}
                    carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]}) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
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
                    .setDescription(carList);
                if (currentMessage) {
                    currentMessage.edit(infoScreen);
                }
                else {
                    message.channel.send(infoScreen);
                }
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
                            collected.first().delete();
                            addCar(searchResults[parseInt(collected.first()) - 1], currentDeck, currentMessage);
                        }
                    })
                    .catch(() => {
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return currentMessage.edit(cancelMessage);
                    })
            }
            else if (searchResults.length > 0) {
                if (currentMessage) {
                    addCar(searchResults[0], currentDeck, currentMessage);
                }
                else {
                    addCar(searchResults[0], currentDeck);
                }
            }
            else {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, car requested not found.")
                    .setDescription("Well that sucks. Perhaps you already have this car inside this deck?")
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                }
                else {
                    return message.channel.send(errorMessage);
                }
            }
        }

        async function addCar(currentCar, currentDeck, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]`;
            const racehud = car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`];

            for (const deck of decks) {
                if (deck.name = currentDeck.name) {
                    deck.hand[index - 1] = { carFile: currentCar.carFile, gearingUpgrade: currentCar.gearingUpgrade, engineUpgrade: currentCar.engineUpgrade, chassisUpgrade: currentCar.chassisUpgrade };
                }
            }
            await db.set(`acc${message.author.id}.decks`, decks);

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added your ${currentName} to slot ${index} of deck ${currentDeck.name}!`)
                .setImage(racehud)
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