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
    name: "sell",
    aliases: ["s"],
    usage: "(optional) <amount> | <car name goes here>",
    description: "Sells one or more cars from your garage.",
    args: 1,
	isExternal: true,
    adminOnly: false,
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const garage = playerData.garage;
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (garage.length <= 5) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("HOLD ON RIGHT THERE!")
                .setDescription("You can't do anything without more than 5 cars. Please don't sell any more cars and build up your garage!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        let carName;
        let amount = 1;
		if (args[0].toLowerCase() === "all" && args[1]) {
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
		}
        else if (isNaN(args[0]) || !args[1]) {
            carName = args.slice(0, args.length).map(i => i.toLowerCase());
        }
        else {
            amount = Math.ceil(parseInt(args[0]));
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
        }

		const searchResults = garage.filter(function (garageCar) {
            return carName.every(part => garageCar.carFile.includes(part)) && garageCar["000"] + garageCar["333"] + garageCar["666"] > 0;
        });
		let searchResults1 = [];

		if (args[0].toLowerCase() === "all" || amount > 1) {
			for (let car of searchResults) {
				let test = require(`./cars/${car.carFile}`);
				if (car["000"] >= amount || car["333"] >= amount || car["666"] >= amount) {
					if (test["isPrize"] === false) {
						searchResults1.push(car);
					}
				}
			}
		}
		else {
			searchResults1 = searchResults.filter(c => {
				let test = require(`./cars/${c.carFile}`);
				return test["isPrize"] === false;
			});
		}
        if (searchResults1.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults1.length; i++) {
                let car = require(`./cars/${searchResults1[i - 1].carFile}`);
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
                .setDescription(carList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
                    errors: ['time']
                })
                    .then(collected => {
						collected.first().delete();
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
                            currentCar = searchResults1[parseInt(collected.first()) - 1];
                            selectUpgrade(currentCar, currentMessage);
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
        else if (searchResults1.length > 0) {
            selectUpgrade(searchResults1[0]);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, it looks like you don't have enough cars to perform this action.")
                .setDescription("If you are bulk fusing cars, take note that you can't bulk fuse upgraded cars. Besides, you can't fuse maxed cars and prize cars.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

		async function selectUpgrade(currentCar, currentMessage) {
			let upgradeList = "Type in any tune that is displayed here.\n";
			for (let [key, value] of Object.entries(currentCar)) {
				if (!isNaN(value) && value >= amount) {
					upgradeList += `\`${key}\`, `;
				}
			}

			let infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Sell car of which tune?")
				.setDescription(upgradeList.slice(0, -2))
				.setTimestamp();
			let upgradeMessage;
			if (currentMessage) {
				upgradeMessage = await currentMessage.edit(infoScreen);
			}
			else {
				upgradeMessage = await message.channel.send(infoScreen);
			}

			message.channel.awaitMessages(filter, {
				max: 1,
				time: 60000,
				errors: ["time"]
			})
				.then(collected => {
					collected.first().delete();
					if (isNaN(collected.first().content) || currentCar[collected.first().content] === undefined || currentCar[collected.first().content] === 0) {
						const errorMessage = new Discord.MessageEmbed()
							.setColor("#fc0303")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Error, invalid selection provided.")
							.setDescription("It looks like your response was not part of the selection.")
							.setTimestamp();
						return upgradeMessage.edit(errorMessage);
					}
					else {
						sell(currentCar, collected.first().content, upgradeMessage);
					}
				})
				.catch(() => {
					const cancelMessage = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Action cancelled automatically.")
						.setTimestamp();
					return upgradeMessage.edit(cancelMessage);
				});
		}

        async function sell(currentCar, upgrade, currentMessage) {
            const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
			if (args[0].toLowerCase() === "all") {
				amount = currentCar[upgrade];
			}

            let money;
            if (car["rq"] > 79) { //leggie
                money = 200000 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 4500);
            }
            else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                money = 77500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 3750);
            }
            else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                money = 27500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 3000);
            }
            else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                money = 7500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 2250);
            }
            else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                money = 1000 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 1500);
            }
            else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                money = 500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 750);
            }
            else { //common
                money = 200 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 500);
            }
			money *= amount;

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to sell ${amount} of your ${currentName}s for ${moneyEmoji}${money}?`)
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
                   					delete playerData.hand;
                				}
							}

							let remove = garage.find(garageCar => {
								return garageCar.carFile === currentCar.carFile;
							});
							remove[upgrade] -= amount;
							if (remove["000"] + remove["333"] + remove["666"] + remove["996"] + remove["969"] + remove["699"] === 0) {
								playerData.garage.splice(garage.indexOf(currentCar), 1);
                        	}
							playerData.money += money;

                            await db.set(`acc${message.author.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully sold ${amount} your ${currentName}s!`)
                                .setDescription(`You earned ${moneyEmoji}${money}!`)
                                .addField("Your Money Balance", `${moneyEmoji}${playerData.money}`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(infoScreen);
                        case "❎":
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setDescription(`Your ${currentName}s stays in your garage.`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
                })
                .catch(() => {
                    reactionMessage.reactions.removeAll();
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setDescription(`Your ${currentName}s stays in your garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}