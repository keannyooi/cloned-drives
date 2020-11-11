const Discord = require("discord.js-light");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const moment = require("moment");

module.exports = {
	name: "refreshdealership",
	aliases: ["rfdeal", "refreshdeal", "rfdealership"],
	usage: "(no arguments required)",
	args: false,
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
					var currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
					while (isOnSale(currentCard)) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
					}
					const currentName = `${currentCard["make"]} ${currentCard["model"]} (${currentCard["modelYear"]})`;
					const price = definePrice(currentCard["rq"]);
					catalog[i] = { carFile: currentName.toLowerCase(), price: price };
					console.log(catalog[i].carFile);
					i++;
				}
				catalog.sort(function(a, b) {
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
				return 225000 + (Math.floor(Math.random() * 45000));
			}
			else if (rq > 64 && rq <= 79) { //epic
				return 85000 + (Math.floor(Math.random() * 37500));
			}
			else if (rq > 49 && rq <= 64) { //ultra
				return 32500 + (Math.floor(Math.random() * 30000));
			}
			else if (rq > 39 && rq <= 49) { //super
				return 10000 + (Math.floor(Math.random() * 22500));
			}
			else if (rq > 29 && rq <= 39) { //rare
				return 2000 + (Math.floor(Math.random() * 15000));
			}
			else if (rq > 19 && rq <= 29) { //uncommon
				return 750 + (Math.floor(Math.random() * 7500));
			}
			else { //common
				return 200 + (Math.floor(Math.random() * 5000));
			}
		}
	}
}