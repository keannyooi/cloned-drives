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
    name: "removecar",
    aliases: ["rmvcar"],
    usage: "<username> <car name goes here>",
    args: true,
    adminOnly: true,
    description: "Removes a car from someone's garage. (data transferring)",
    async execute(message, args) {
        const db = message.client.db;
        if (!args[1]) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, arguments provided insufficient.")
                .setDescription("Correct syntax: `cd-removecar <username> <car name goes here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        var index = 0;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        var user, member;
        if (args.length) {
            var userName = args[0].toLowerCase();

            message.guild.members.cache.forEach(User => {
                if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                    console.log("found!");
                    user = User.user;
                    member = message.guild.member(User);
                }
            });
        }

        if (!user) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 user not found.")
                .setDescription("It looks like this user isn't in this server. \nCorrect syntax: `cd-removecar <username> <car name goes here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (user.bot) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, user requested is a bot.")
                .setDescription("Bots can't play Cloned Drives.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        const playerData = await db.get(`acc${user.id}`);
        const garage = playerData.garage;
        if (garage.length <= 5) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("HOLD ON RIGHT THERE!")
                .setDescription("This player only has 5 cars left. Please spare him and stop removing cars from his possession!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        var carName = args.slice(1, args.length);
        carName = carName.map(i => i.toLowerCase());

        const searchResults = garage.filter(function (garageCar) {
            return carName.every(part => garageCar.carFile.includes(part));
        });

        if (searchResults.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                const car = require(`./cars/${searchResults[i - 1].carFile}`);
                carList += `${i} - ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${searchResults[i - 1].gearingUpgrade}${searchResults[i - 1].engineUpgrade}${searchResults[i - 1].chassisUpgrade}]\n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple cars found, please type one of the following.")
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setDescription(carList)
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
                            let currentCar = searchResults[parseInt(collected.first()) - 1];
                            removeCar(currentCar, currentMessage);
                        }
                    })
                    .catch(error => {
                        console.log(error);
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
            removeCar(searchResults[0]);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Error, it looks like ${user.username} doesn't have that car.`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setDescription("oof")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function removeCar(currentCar, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]`;

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove ${user.username}'s ${currentName} from their garage?`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(car["card"])
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
                            if (playerData.hand) {
                                if (playerData.hand.carFile === currentCar.carFile) {
                                    playerData.hand = null;
                                }
                            }
                            var i = 0;
                            while (i < playerData.decks.length) {
                                const hasCar = playerData.decks[i].hand.find(function (car) {
                                    return car.carFile === currentCar.carFile;
                                });
                                if (hasCar) {
                                    const index = playerData.decks[i].hand.indexOf(hasCar);
                                    playerData.decks[i].hand[index] = "None";
                                }
                                i++;
                            }

                            garage.splice(garage.indexOf(currentCar), 1);
                            await db.set(`acc${user.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${member.displayName}'s ${currentName}!`)
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
                            reactionMessage.reactions.removeAll();
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setDescription(`${member.displayName}'s ${currentName} stays in their garage.`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
                })
                .catch(error => {
                    console.error(error);
                    reactionMessage.reactions.removeAll();
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                        .setDescription(`${member.displayName}'s ${currentName} stays in their garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}