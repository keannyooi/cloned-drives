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

        var carName = args[1].toLowerCase();
        var index = 0;
        const searchResults = [];
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

        for (i = 2; i < args.length; i++) {
            carName += (" " + args[i].toLowerCase());
        }

        var counter = 0;
        var searched = 0;
        while (counter < garage.length) {
            var currentCar = require(`./cars/${garage[counter].carFile}`);
            var currentName = currentCar["make"].toLowerCase() + " " + currentCar["model"].toLowerCase() + " " + currentCar["modelYear"];
            if (currentName.includes(carName)) {
                console.log("found!");
                console.log(currentName)
                searchResults[searched] = { car: garage[counter], index: counter };
                searched++;
            }
            counter++;
        }

        if (searched > 0) {
            var currentCar = searchResults[0].car.carFile;
            if (searched > 1) {
                var carList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    const car = require(`./cars/${searchResults[i - 1].car.carFile}`);
                    carList += `${i} - ` + car["make"] + " " + car["model"] + " (" + car["modelYear"] + `) [${searchResults[i - 1].car.gearingUpgrade}${searchResults[i - 1].car.engineUpgrade}${searchResults[i - 1].car.chassisUpgrade}]\n`;
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple cars found, please type one of the following.")
                    .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                    .setDescription(carList)
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
                                currentCar = searchResults[parseInt(collected.first()) - 1].car;
                                index = searchResults[parseInt(collected.first()) - 1].index;
                                removeCar(currentCar, index);
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
            else {
                index = searchResults[0].index;
                removeCar(searchResults[0].car, index);
            }
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

        function removeCar(currentCar, index) {
            const car = require(`./cars/${currentCar.carFile}`);
            const currentName = `${car["make"]} ${car["model"]} (${car["modelYear"]}) [${garage[index].gearingUpgrade}${garage[index].engineUpgrade}${garage[index].chassisUpgrade}]`;

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to remove ${user.username}'s ${currentName} from their garage?`)
                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(car["card"])
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
							var y = 0;
							while (y < playerData.garage.length) {
								if (playerData.hand) {
									if (playerData.hand.carFile === currentCar.carFile) {
										playerData.hand = null;
									}
								}
								var i = 0, x = 0;
								while (i < playerData.decks.length) {
									while (x < playerData.decks[i].hand.length) {
										if (playerData.decks[i].hand[x].carFile === currentCar.carFile) {
											playerData.decks[i].hand[x] = "None";
										}
										x++;
									}
									i++;
								}
								y++;
							}

							garage.splice(index, 1);
                            await db.set(`acc${user.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully removed ${member.displayName}'s ${currentName}!`)
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTimestamp();
                            return message.channel.send(infoScreen);
                        }
                        else if (collected.first().emoji.name === "❎") {
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setDescription(`${member.displayName}'s ${currentName} stays in their garage.`)
                                .setTimestamp();
                            return message.channel.send(cancelMessage);
                        }
                    })
                    .catch(error => {
						console.error(error);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                            .setDescription(`${member.displayName}'s ${currentName} stays in their garage.`)
                            .setTimestamp();
                        return message.channel.send(cancelMessage);
                    });
            });
        }
    }
}