/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const moment = require("moment");

module.exports = {
	name: "refreshdealership",
	aliases: ["rfdeal", "refreshdeal", "rfdealership"],
	usage: "(no arguments required)",
	args: 0,
	isExternal: false,
	adminOnly: true,
	description: "Refreshes the dealership catalog immediately.",
	execute(message) {
		try {
			const db = message.client.db;

			refresh();
			db.set("lastDealershipRefresh", moment().format("L"));

			const deckScreen = new Discord.MessageEmbed()
				.setColor("#03fc24")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Successfully refreshed dealership!")
				.setDescription("Check out what's in stock using `cd-dealership`!")
				.setTimestamp();
			return message.channel.send(deckScreen);

			async function refresh() {
				const catalog = [];
				var i = 0;
				while (i < 8) {
					const randNum = Math.floor(Math.random() * 100);
					let currentName, price, stock;
					let currentCard;
					if (randNum < 33) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						stock = 1000;
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 19) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 49 || currentCard["rq"] < 40) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
					}
					else if (randNum < 66) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 29 || currentCard["rq"] < 20) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 1000;
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 64 || currentCard["rq"] < 50) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 25;
						}
					}
					else if (randNum < 91) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 39 || currentCard["rq"] < 30) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 1000;
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 64 || currentCard["rq"] < 50) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 25;
						}
					}
					else {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 49 || currentCard["rq"] < 40) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 1000;
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 79 || currentCard["rq"] < 65) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
							stock = 5;
						}
					}
					currentName = `${currentCard["make"]} ${currentCard["model"]} (${currentCard["modelYear"]})`;
					price = definePrice(currentCard["rq"]);
					catalog[i] = { carFile: currentName.toLowerCase(), price: price, stock: stock };
					i++;
				}
				catalog.sort(function (a, b) {
					if (a.price === b.price) {
						const carA = require(`./cars/${a.carFile}`);
						const carB = require(`./cars/${b.carFile}`);
						const nameA = `${carA.make.toLowerCase()} ${carA.model.toLowerCase()}`;
						const nameB = `${carB.make.toLowerCase()} ${carB.model.toLowerCase()}`;

						if (nameA < nameB) {
							return -1;
						}
						else if (nameA > nameB) {
							return 1;
						}
						else {
							return 0;
						}
					}
					else {
						if (a.price < b.price) {
							return -1;
						}
						else {
							return 1;
						}
					}
				});
				await db.set("dealershipCatalog", catalog);

				function isOnSale(card) {
					var isOnSale = false;
					for (i = 0; i < catalog.length; i++) {
						const catalogCar = require(`./cars/${catalog[i].carFile}`);
						if (catalogCar === card) {
							isOnSale = true;
						}
					}
					return isOnSale;
				}
			}
		}
		catch (error) {
			console.log(error);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, failed to refresh dealership.")
				.setDescription(`Something must have gone wrong. Please report this issure to the devs. \n\`${error}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		function definePrice(rq) {
			if (rq > 79) { //leggie
				return 1000000 + (Math.floor(Math.random() * 1000000));
			}
			else if (rq > 64 && rq <= 79) { //epic
				return 384000 + (Math.floor(Math.random() * 384000));
			}
			else if (rq > 49 && rq <= 64) { //ultra
				return 96000 + (Math.floor(Math.random() * 192000));
			}
			else if (rq > 39 && rq <= 49) { //super
				return 24000 + (Math.floor(Math.random() * 24000));
			}
			else if (rq > 29 && rq <= 39) { //rare
				return 8000 + (Math.floor(Math.random() * 16000));
			}
			else if (rq > 19 && rq <= 29) { //uncommon
				return 2000 + (Math.floor(Math.random() * 2000));
			}
			else { //common
				return 500 + (Math.floor(Math.random() * 500));
			}
		}
	}
}