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
    name: "removeall",
    aliases: ["rmvall"],
    usage: "<username> | <car name goes here>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Removes all of a certain car from someone's garage.",
    async execute(message, args) {
        const db = message.client.db;
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
        let garage = playerData.garage;
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
		let searchResults1 = [];
		for (let car of searchResults) {
			if (searchResults1.indexOf(car.carFile) === -1) {
				searchResults1.push(car.carFile);
			}
		}

        if (searchResults1.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults1.length; i++) {
                const car = require(`./cars/${searchResults1[i - 1]}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
                carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
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
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults1.length) {
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            let currentCar = searchResults1[parseInt(collected.first()) - 1];
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
        else if (searchResults1.length > 0) {
            removeCar(searchResults1[0]);
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
            const car = require(`./cars/${currentCar}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]})`;

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove ${user.username}'s ${currentName}s from their garage?`)
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
                                if (playerData.hand.carFile === currentCar) {
                                    playerData.hand = null;
                                }
                            }
                            var i = 0;
                            while (i < playerData.decks.length) {
                                const hasCar = playerData.decks[i].hand.find(function (car) {
                                    return car.carFile === currentCar;
                                });
                                if (hasCar) {
                                    const index = playerData.decks[i].hand.indexOf(hasCar);
                                    playerData.decks[i].hand[index] = "None";
                                }
                                i++;
                            }
							
                            playerData.garage = garage.filter(garageCar => garageCar.carFile !== currentCar);
                            await db.set(`acc${user.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${member.displayName}'s ${currentName}s!`)
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
                                .setDescription(`${member.displayName}'s ${currentName}s stays in their garage.`)
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
                        .setDescription(`${member.displayName}'s ${currentName}s stays in their garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}