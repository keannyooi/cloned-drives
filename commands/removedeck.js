const Discord = require("discord.js-light");

module.exports = {
    name: 'removedeck',
    aliases: ["deletedeck", "rmvdeck"],
    usage: "<deck name goes here>",
    args: true,
    adminOnly: false,
    description: 'Deletes a deck of your choice. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
		const db = message.client.db;
        const deckName = args[0].toLowerCase();
        const decks = await db.get(`acc${message.author.id}.decks`);
        const searchResults = [];
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

        var counter = 0;
        var searched = 0;
        while (counter < decks.length) {
            var currentName = decks[counter].name.toLowerCase();
            if (currentName.includes(deckName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = { deck: decks[counter], index: counter };
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentDeck = searchResults[0].deck;
            if (searched > 1) {
                var deckList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    deckList += `${i} - ${searchResults[i - 1].deck.name} \n`;
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple decks found, please type one of the following.")
                    .setDescription(deckList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(() => {
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
                                return message.channel.send(errorMessage);
                            }
                            else {
                                currentDeck = searchResults[parseInt(collected.first()) - 1].deck;
                                index = searchResults[parseInt(collected.first()) - 1].index;
                                removeDeck(currentDeck, index);
                            }
                        })
                        .catch(collected => {
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
                index = searchResults[0].index;
                removeDeck(currentDeck, index);
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

        function removeDeck(currentDeck, index) {
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your deck named ${currentDeck.name}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
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
                            decks.splice(index, 1);

                            await db.set(`acc${message.author.id}.decks`, decks);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed deck named ${currentDeck.name}!`)
                                .setDescription("You earned nothing!")
                                .setTimestamp();
                            return message.channel.send(infoScreen);
                        }
                        else if (collected.first().emoji.name === "❎") {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return message.channel.send(cancelMessage);
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
    }
}