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
    name: "removefromdeck",
    usage: "<deck name goes here> <index>",
    args: true,
    adminOnly: false,
    description: 'Removes a car from a specified slot in a specifed deck. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        if (!args[1]) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, arguments provided insufficient.")
                .setDescription("Correct syntax: `cd-addtodeck <deck name goes here> <index>`")
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
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

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

                message.channel.send(infoScreen).then(currentMessage => {
                    message.channel.awaitMessages(filter, {
                        max: 1,
                        time: 30000,
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
                                return currentMessage.edit(errorMessage);
                            }
                            else {
                                currentDeck = searchResults[parseInt(collected.first()) - 1].deck;
                                removeCar(currentDeck, parseInt(index));
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
                removeCar(currentDeck, parseInt(index));
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

        async function removeCar(currentDeck, index) {
			const currentCar = currentDeck.hand[index - 1];
			if (currentCar === "None") {
				const errorMessage = new Discord.MessageEmbed()
                	.setColor("#fc0303")
                	.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                	.setTitle("Error, slot requested is already empty.")
                	.setDescription("Try checking again with `cd-decks`.")
                	.setTimestamp();
            	return message.channel.send(errorMessage);
			}

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

			const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your ${currentName} from slot ${index - 1} of deck ${currentDeck.name}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
				.setImage(racehud)
                .setTimestamp();

            message.channel.send(confirmationMessage).then(reactionMessage => {
                reactionMessage.react("✅");
                reactionMessage.react("❎");
                reactionMessage.awaitReactions(emojiFilter, {
                    max: 1,
                    time: 10000,
                    errors: ['time']
                })
                    .then(async collected => {
                        reactionMessage.reactions.removeAll();
                        if (collected.first().emoji.name === "✅") {
                            currentDeck.hand[index - 1] = "None";
							await db.set(`acc${message.author.id}`, playerData);

            				const infoScreen = new Discord.MessageEmbed()
                				.setColor("#34aeeb")
                				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                				.setTitle(`Successfully removed ${currentName} from slot ${index - 1} of deck ${currentDeck.name}.`)
                				.setImage(racehud)
                				.setTimestamp();
            				return reactionMessage.edit(infoScreen);
                        }
                        else if (collected.first().emoji.name === "❎") {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        }
                    })
                    .catch(() => {
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return reactionMessage.edit(cancelMessage);
                    });
            });
        }
    }
}