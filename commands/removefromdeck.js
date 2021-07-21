/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const disbut = require("discord-buttons");

module.exports = {
    name: "removefromdeck",
    usage: "<deck name goes here> | <index>",
    args: 2,
    category: "Configuration",
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
                    errors: ['time']
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
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            removeCar(searchResults[parseInt(collected.first().content) - 1].deck, parseInt(index), currentMessage);
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
            const buttonFilter = (button) => {
                return button.clicker.user.id === message.author.id;
            };
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

            const car = require(`./cars/${currentCar}`);
            let make = car["make"];
            if (typeof make === "object") {
                make = car["make"][0];
            }
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${currentDeck.tunes[index - 1]}]`;
            const racehud = car[`racehud${currentDeck.tunes[index - 1]}`];

            let yse = new disbut.MessageButton()
                .setStyle("green")
                .setLabel("Yes!")
                .setID("yse");
            let nop = new disbut.MessageButton()
                .setStyle("red")
                .setLabel("No!")
                .setID("nop");
            let row = new disbut.MessageActionRow().addComponents(yse, nop);
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove your ${currentName} from slot ${index} of deck ${currentDeck.name}?`)
                .setImage(racehud)
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
                            currentDeck.hand[index - 1] = "None";
                            currentDeck.tunes[index - 1] = "000";
                            await db.set(`acc${message.author.id}`, playerData);
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${currentName} from slot ${index} of deck ${currentDeck.name}.`)
                                .setImage(racehud)
                                .setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: null });
                        case "nop":
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setImage(racehud)
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
                        .setImage(racehud)
                        .setTimestamp();
                    return reactionMessage.edit({ embed: cancelMessage, component: null });
                }
            });
        }
    }
}