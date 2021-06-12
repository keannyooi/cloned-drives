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
    name: "fuse",
    aliases: ["f"],
    usage: "(optional) <amount> | <car name goes here>",
    args: 1,
	isExternal: true,
    adminOnly: false,
    description: "Converts one or more cars inside your garage into fuse tokens.",
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const garage = playerData.garage;
        const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
        const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

        if (garage.length <= 5) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("HOLD ON RIGHT THERE!")
                .setDescription("You can't do anything without more than 5 cars. Please don't fuse any more cars and build up your garage!")
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
			let test = require(`./cars/${garageCar.carFile}`);
            if (amount === 1) {
                return carName.every(part => garageCar.carFile.includes(part)) && !test["isPrize"] && (garageCar["000"] >= amount || garageCar["333"] >= amount || garageCar["666"] >= amount);
            }
            else {
                return carName.every(part => garageCar.carFile.includes(part)) && !test["isPrize"] && garageCar["000"] >= amount;
            }
        });

        if (searchResults.length > 1) {
            let carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let car = require(`./cars/${searchResults[i - 1].carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
				carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
            }

            if (carList.length > 2048) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
					.addField("Total Characters in List", `\`${carList.length}\` > \`2048\``)
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
                    errors: ["time"]
                })
                    .then(collected => {
						if (message.channel.type === "text") {
							collected.first().delete();
						}
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
                            selectUpgrade(searchResults[parseInt(collected.first().content) - 1], currentMessage);
                        }
                    })
                    .catch(error => {
						console.log(error);
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
            selectUpgrade(searchResults[0]);
        }
        else {
            let find = garage.filter(g => {
                return carName.every(part => g.carFile.includes(part));
            })
            console.log(find);
            if (find.length === 0) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, it looks like you don't have this car.")
                    .setDescription("Well that's sad.")
                    .addField("Keywords Received", `\`${carName.join(" ")}\``)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            else {
                let bannedList = "";
                let errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, it looks like you either don't have this car, or you are unable to fuse it.")
                    .setDescription("Note: You can't fuse maxed cars and prize cars.")
                    .addField("Keywords Received", `\`${carName.join(" ")}\``)
                    .setTimestamp();
                for (let i = 0; i < find.length; i++) {
                    let errCar = require(`./cars/${find[i].carFile}`);
                    let make = errCar["make"];
                    if (typeof make === "object") {
                        make = errCar["make"][0];
                    }

                    if (errCar["isPrize"]) {
                        bannedList += `${make} ${errCar["model"]} (${errCar["modelYear"]}) ${trophyEmoji}\n`;
                    }
                    else {
                        let upgList = "";
                        for (let [key, value] of Object.entries(find[i])) {
                            if (!isNaN(value) && value !== 0) {
                                upgList += `${value}x ${key}, `;
                            }
                        }
                        bannedList += `${make} ${errCar["model"]} (${errCar["modelYear"]}) \`(${upgList.slice(0, -2)}, not enough to perform action) (${amount}x non-maxed car required)\`\n`;
                    }
                }
                errorMessage.addField("Cars Found", bannedList);
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                return message.channel.send(errorMessage);
            }
        }

		async function selectUpgrade(currentCar, currentMessage) {
			let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && !m.includes("96") && !m.includes("69") && currentCar[m] >= amount);
			if (isOne.length === 1) {
				fuse(currentCar, isOne[0], currentMessage);
			}
			else {
				let upgradeList = "Type in any tune that is displayed here.\n";
				for (i = 0; i < isOne.length; i++) {
					upgradeList += `\`${isOne[i]}\`, `;
				}
				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Fuse car of which tune?")
					.setDescription(upgradeList.slice(0, -2))
					.setTimestamp();
				let upgradeMessage;
				if (currentMessage && message.channel.type === "text") {
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
						if (message.channel.type === "text") {
							collected.first().delete();
						}
						if (isOne.find(m => m === collected.first().content) === undefined) {
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							const errorMessage = new Discord.MessageEmbed()
								.setColor("#fc0303")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Error, invalid selection provided.")
								.setDescription("It looks like your response was not part of the selection.")
                                .addField("Value Received", `\`${collected.first().content}\``)
								.setTimestamp();
							return upgradeMessage.edit(errorMessage);
						}
						else {
							fuse(currentCar, collected.first().content, upgradeMessage);
						}
					})
					.catch(error => {
						console.log(error);
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled automatically.")
							.setTimestamp();
						return upgradeMessage.edit(cancelMessage);
					});
			}
		}

        async function fuse(currentCar, upgrade, currentMessage) {
            let car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;

			if (args[0].toLowerCase() === "all") {
				amount = currentCar[upgrade];
			}

            let fuseTokens;
            if (car["rq"] > 79) { //leggie
                fuseTokens = 12500;
            }
            else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                fuseTokens = 2500;
            }
            else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                fuseTokens = 750;
            }
            else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                fuseTokens = 350;
            }
            else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                fuseTokens = 100;
            }
            else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                fuseTokens = 30;
            }
            else { //common
                fuseTokens = 10;
            }
			fuseTokens *= amount;

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to fuse ${amount} of your ${currentName} for ${fuseEmoji}${fuseTokens}?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setImage(car["card"])
                .setTimestamp();
            let reactionMessage;
			if (currentMessage && message.channel.type === "text") {
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
                errors: ["time"]
            })
                .then(async collected => {
					if (message.channel.type === "text") {
						reactionMessage.reactions.removeAll();
					}
                    switch (collected.first().emoji.name) {
                        case "✅":
                        	if (playerData.hand) {
								if (playerData.hand.carFile === currentCar.carFile) {
                   					delete playerData.hand;
                				}
							}
							for (i = 0; i < playerData.decks.length; i++) {
								for (x = 0; x < 5; x++) {
									if (playerData.decks[i].hand[x] === currentCar.carFile && playerData.decks[i].tunes[x] === upgrade) {
										playerData.decks[i].hand[x] = "None";
										playerData.decks[i].tunes[x] = "000";
									}
								}
							}

							let remove = garage.find(garageCar => {
								return garageCar.carFile === currentCar.carFile;
							});
							remove[upgrade] -= amount;
							if (remove["000"] + remove["333"] + remove["666"] + remove["996"] + remove["969"] + remove["699"] === 0) {
								playerData.garage.splice(garage.indexOf(currentCar), 1);
                        	}
							playerData.fuseTokens += fuseTokens;

                            await db.set(`acc${message.author.id}`, playerData);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully fused your ${currentName}!`)
                                .setDescription(`You earned ${fuseEmoji}${fuseTokens}!`)
                                .addField("Your Fuse Tokens", `${fuseEmoji}${playerData.fuseTokens}`)
                                .setImage(car["card"])
                                .setTimestamp();
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            return reactionMessage.edit(infoScreen);
                        case "❎":
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
                .catch(error => {
					console.log(error);
                    reactionMessage.reactions.removeAll();
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setDescription(`Your ${currentName} stays in your garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
        }
    }
}