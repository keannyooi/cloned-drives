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
    category: "Configuration",
    description: 'Deletes a deck of your choice. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        const db = message.client.db;
        const deckName = args[0].toLowerCase();
        const playerData = await db.get(`acc${message.author.id}`);
        const decks = playerData.decks;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (args[1]) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, deck name provided contains spaces.")
                .setDescription("Deck names cannot contain spaces. Consider replacing the spaces with underscores (_).")
                .setTimestamp();
            return message.channel.send(infoScreen);
        }

        const searchResults = decks.filter(function (deck) {
            return deck.name.toLowerCase().includes(deckName);
        });

        if (searchResults.length > 1) {
            let deckList = "";
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
                    errors: ["time"]
                })
                    .then(collected => {
                        collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            removeDeck(searchResults[parseInt(collected.first().content) - 1], currentMessage);
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
            removeDeck(searchResults[0]);
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

        async function removeDeck(currentDeck, currentMessage) {
            const buttonFilter = (button) => {
                return button.clicker.user.id === message.author.id;
            };
            let yse, nop;
            if (playerData.settings.buttonstyle === "classic") {
                yse = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("✅")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("❎")
                    .setID("nop");
            }
            else {
                yse = new disbut.MessageButton()
                    .setStyle("green")
                    .setLabel("Yes!")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("red")
                    .setLabel("No!")
                    .setID("nop");
            }
            let row = new disbut.MessageActionRow().addComponents(yse, nop);
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your deck named ${currentDeck.name}?`)
                .setTimestamp();
            let reactionMessage, processed = false;
            if (currentMessage) {
                reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
            }
            else {
                reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
            }

            const collector = reactionMessage.createButtonCollector(buttonFilter, { time: 10000 });
            collector.on("collect", async button => {
                if (!processed) {
                    processed = true;
                    switch (button.id) {
                        case "yse":
                            decks.splice(decks.indexOf(currentDeck), 1);
                            await db.set(`acc${message.author.id}.decks`, decks);
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed deck named ${currentDeck.name}!`)
                                .setDescription("You earned nothing!")
                                .setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: null });
                        case "nop":
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit({ embed: cancelMessage, component: null });
                        default:
                            break;
                    }
                }
            });
            collector.on("end", () => {
                if (!processed) {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit({ embed: cancelMessage, component: null });
                }
            });
        }
    }
}