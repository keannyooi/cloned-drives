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
    usage: "<deck name goes here> | <index>",
    args: 2,
	isExternal: true,
    adminOnly: true,
    description: 'Removes a car from a specified slot in a specifed deck. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const decks = playerData.decks;
        const deckName = args[0].toLowerCase();
        const index = Math.ceil(parseInt(args[1]));
        if (isNaN(index) || index > 5 || index < 1) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, index provided is either invalid or not a number.")
                .setDescription("Indexes must be a number and must be between 1 to 5.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        const searchResults = decks.filter(function (deck) {
            return deck.name.includes(deckName);
        });

        if (searchResults.length > 1) {
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
						collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            removeCar(searchResults[parseInt(collected.first()) - 1].deck, parseInt(index), currentMessage);
                        }
                    })
                    .catch(() => {
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
            removeCar(searchResults[0], parseInt(index));
        }
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 deck not found.")
                .setDescription(`It looks like you don't have a deck named \`${deckName}\`.`)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function removeCar(currentDeck, index, currentMessage) {
            const currentCar = currentDeck.hand[index - 1];
            if (currentCar === "None") {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, slot requested is already empty.")
                    .setDescription("Try checking again with `cd-decks`.")
                    .setTimestamp();
                if (currentMessage) {
                    return currentMessage.edit(errorMessage);
                }
                else {
                    return message.channel.send(errorMessage);
                }
            }

            const car = require(`./cars/${currentCar.carFile}`);
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]`;
            const racehud = car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`];

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your ${currentName} from slot ${index} of deck ${currentDeck.name}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(racehud)
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
                            currentDeck.hand[index - 1] = "None";
                            await db.set(`acc${message.author.id}`, playerData);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${currentName} from slot ${index} of deck ${currentDeck.name}.`)
                                .setImage(racehud)
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
                            reactionMessage.reactions.removeAll();
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
                })
                .catch(() => {
                    reactionMessage.reactions.removeAll();
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}