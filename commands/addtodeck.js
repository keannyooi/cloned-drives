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
    args: true,
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
            console.log(currentDeck);
            const garage = playerData.garage;
            for (i = 0; i < currentDeck.hand.length; i++) {
                console.log("hi");
                for (x = 0; x < garage.length; x++) {
                    const upgrade = `${garage[x].gearingUpgrade}${garage[x].engineUpgrade}${garage[x].chassisUpgrade}`;
                    const handUpgrade = `${currentDeck.hand[i].gearingUpgrade}${currentDeck.hand[i].engineUpgrade}${currentDeck.hand[i].chassisUpgrade}`;

                    console.log(upgrade);
                    console.log(handUpgrade);
                    if (currentDeck.hand[i].carFile === garage[x].carFile && upgrade === handUpgrade) {
                        console.log(garage[x]);
                        garage.splice(x, 1);
                    }
                }
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
                                currentCar = searchResults[parseInt(collected.first()) - 1];
                                collected.first().delete();
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
                addCar(currentCar, currentDeck, currentMessage);
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
            const upgrade = `${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`;
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            var racehud;
            switch (upgrade) {
                case "000":
                    racehud = car["racehudStock"];
                    break;
                case "333":
                    racehud = car["racehud1Star"];
                    break;
                case "666":
                    racehud = car["racehud2Star"];
                    break;
                case "996":
                    racehud = car["racehudMaxed996"];
                    break;
                case "969":
                    racehud = car["racehudMaxed969"];
                    break;
                case "699":
                    racehud = car["racehudMaxed699"];
                    break;
                default:
                    break;
            }

            for (const deck of decks) {
                if (deck.name = currentDeck.name) {
                    deck.hand[index - 1] = { carFile: currentCar.carFile, gearingUpgrade: currentCar.gearingUpgrade, engineUpgrade: currentCar.engineUpgrade, chassisUpgrade: currentCar.chassisUpgrade };
                }
            }
            await db.set(`acc${message.author.id}.decks`, decks);

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully added your ${currentName} to slot ${index} of deck ${currentDeck.name}.`)
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