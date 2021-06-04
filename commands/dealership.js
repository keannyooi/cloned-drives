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
const Canvas = require("canvas");

module.exports = {
	name: "dealership",
	aliases: ["deal", "dealer"],
	usage: "(no arguments required)",
	args: 0,
	isExternal: true,
	adminOnly: false,
	description: "Check what's on sale in the car dealership here!",
	async execute(message) {
		const wait = message.channel.send("**Loading dealership, this may take a while... (please wait)**");

		try {
			const db = message.client.db;
			const cardPlacement = [{ x: 7, y: 3 }, { x: 178, y: 3 }, { x: 349, y: 3 }, { x: 520, y: 3 }, { x: 7, y: 143 }, { x: 178, y: 143 }, { x: 349, y: 143 }, { x: 520, y: 143 }];

			const userData = await db.get(`acc${message.author.id}`);
			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
			let lastRefresh = await db.get("lastDealershipRefresh");
			let catalog = await db.get("dealershipCatalog");
			console.log(`${lastRefresh} - ${moment().format("L")}`);

			if (!lastRefresh) {
				lastRefresh = moment([2020, 1, 1]).format("L");
			}
			if (lastRefresh !== moment().format("L") || !catalog) {
				await refresh();
			}

			const canvas = Canvas.createCanvas(694, 249);
			const ctx = canvas.getContext('2d');
			let attachment, promises, cucked = false;

			try {
				const background = await Canvas.loadImage("https://cdn.discordapp.com/attachments/715771423779455077/799579880819785778/unknown.png");
				ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

				const cards = catalog.map(car => {
					let currentCar = require(`./cars/${car.carFile}`);
					return Canvas.loadImage(currentCar["card"]);
				});
				promises = await Promise.all(cards);
			}
			catch (error) {
				console.log(error);
				let errorPic = "https://cdn.discordapp.com/attachments/715771423779455077/796213265532583966/unknown.png";
				attachment = new Discord.MessageAttachment(errorPic, "dealership.png");
				cucked = true;
			}

			const deckScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Welcome to Cards&Bids, the go-to place for auto enthusiast cards!")
				.setDescription("The catalog refreshes every day. Buy a car from here using `cd-buycar`!")
				.setTimestamp();
			for (i = 0; i < 8; i++) {
				let car = require(`./cars/${catalog[i].carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
				let currentName = `${make} ${car["model"]} (${car["modelYear"]})`;

				if (!cucked) {
					ctx.drawImage(promises[i], cardPlacement[i].x, cardPlacement[i].y, 167, 103);
					attachment = new Discord.MessageAttachment(canvas.toBuffer(), "dealership.png");
				}	
				deckScreen.addField(`${i + 1} - ${currentName}`, `Price: ${moneyEmoji}${catalog[i].price} \nStock Remaining: ${catalog[i].stock}`, true);
			}

			(await wait).delete();
			deckScreen.attachFiles(attachment);
			deckScreen.setImage("attachment://dealership.png");
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			return message.channel.send(deckScreen);

			async function refresh() {
				const catalog = [];
				let i = 0;
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
					let make = currentCard["make"];
					if (typeof make === "object") {
						make = currentCard["make"][0];
					}
					currentName = `${make} ${currentCard["model"]} (${currentCard["modelYear"]})`;
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
				await db.set("lastDealershipRefresh", moment().format("L"));

				function isOnSale(card) {
					let isOnSale = false;
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
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			console.error(error);
			wait.delete();
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, failed to load in dealership.")
				.setDescription(`Something must have gone wrong. Please report this issue to the devs. \n\`${error.stack}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
}

function definePrice(rq) {
	if (rq > 64 && rq <= 79) { //epic
		return 384000 + (Math.floor(Math.random() * 100000));
	}
	else if (rq > 49 && rq <= 64) { //ultra
		return 96000 + (Math.floor(Math.random() * 96000));
	}
	else if (rq > 39 && rq <= 49) { //super
		return 24000 + (Math.floor(Math.random() * 12000));
	}
	else if (rq > 29 && rq <= 39) { //rare
		return 8000 + (Math.floor(Math.random() * 4000));
	}
	else if (rq > 19 && rq <= 29) { //uncommon
		return 2000 + (Math.floor(Math.random() * 2000));
	}
	else { //common
		return 500 + (Math.floor(Math.random() * 500));
	}
}