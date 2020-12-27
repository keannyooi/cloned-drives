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
    name: "removedeck",
    aliases: ["deletedeck", "rmvdeck"],
    usage: "<deck name goes here>",
    args: 1,
	isExternal: true,
    adminOnly: false,
    description: 'Deletes a deck of your choice. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        const db = message.client.db;
        const deckName = args[0].toLowerCase();
        const decks = await db.get(`acc${message.author.id}.decks`);
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (args[1]) {
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, deck name provided contains spaces.")
                .setDescription("Deck names cannot contain spaces. Consider replacing the spaces with underscores (_).")
                .setTimestamp();
            return message.channel.send(infoScreen);
        }

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
                            let currentDeck = searchResults[parseInt(collected.first()) - 1].deck;
                            collected.first().delete();
                            removeDeck(currentDeck, currentMessage);
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
            removeDeck(searchResults[0]);
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

        async function removeDeck(currentDeck, currentMessage) {
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your deck named ${currentDeck.name}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
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
                            decks.splice(decks.indexOf(currentDeck), 1);
                            await db.set(`acc${message.author.id}.decks`, decks);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed deck named ${currentDeck.name}!`)
                                .setDescription("You earned nothing!")
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
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