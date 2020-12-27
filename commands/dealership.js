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
		const wait = await message.channel.send("**Loading dealership, this may take a while... (please wait)**");

		try {
			const db = message.client.db;
			const cardPlacement = [{ x: 21, y: 181 }, { x: 547, y: 181 }, { x: 1073, y: 181 }, { x: 1599, y: 181 }, { x: 21, y: 612 }, { x: 547, y: 612 }, { x: 1073, y: 612 }, { x: 1599, y: 612 }];
			const applyText = (canvas, text) => {
				const ctx = canvas.getContext('2d');
				let fontSize = 48;
				do {
					ctx.font = `${fontSize -= 10}px "Roboto"`;
				} while (ctx.measureText(text).width > 253);

				return ctx.font;
			}

			const userData = await db.get(`acc${message.author.id}`);
			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
			var lastRefresh = await db.get("lastDealershipRefresh");
			var catalog = await db.get("dealershipCatalog");
			console.log(`${lastRefresh} - ${moment().format("L")}`);

			if (!lastRefresh) {
				lastRefresh = moment([2020, 1, 1]).format("L");
			}
			if (lastRefresh !== moment().format("L") || !catalog) {
				await refresh();
			}

			Canvas.registerFont("RobotoCondensed-Regular.ttf", { family: "Roboto" });
			const canvas = Canvas.createCanvas(2135, 1200);
			const ctx = canvas.getContext('2d');

			const background = await Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/757947138788294836/cards_and_bids.jpg");
			ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

			var i = 0;
			while (i < 8) {
				console.log(catalog[i]);
				const currentCar = require(`./cars/${catalog[i].carFile}`);
				const card = await Canvas.loadImage(currentCar["card"]);
				ctx.drawImage(card, cardPlacement[i].x, cardPlacement[i].y, 516, 317);
				i++;
			}

			const avatar = await Canvas.loadImage(message.author.displayAvatarURL({ format: "jpg", dynamic: true }));
			ctx.drawImage(avatar, 8, 8, 155, 155);

			ctx.font = applyText(canvas, message.author.username);
			ctx.fillStyle = "#ffffff";
			ctx.fillText(message.author.username, 260, 60);
			ctx.fillText(userData.money, 610, 60);
			ctx.fillText(userData.trophies, 610, 140);
			ctx.fillText(userData.fuseTokens, 260, 140);

			const attachment = new Discord.MessageAttachment(canvas.toBuffer(), "dealership.png");
			const deckScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Welcome to Cards&Bids, the go-to place for auto enthusiast cards!")
				.setDescription("The catalog refreshes every day. Buy a car from here using `cd-buycar`!")
				.attachFiles(attachment)
				.setImage("attachment://dealership.png")
				.setTimestamp();
			for (i = 0; i < 8; i++) {
				let car = require(`./cars/${catalog[i].carFile}`);
				let make = car["make"];
				if (typeof make === "object") {
					make = car["make"][0];
				}
				const currentName = `${make} ${car["model"]} (${car["modelYear"]})`;
				deckScreen.addField(`${i + 1} - ${currentName}`, `Price: ${moneyEmoji}${catalog[i].price}`, true);
			}
			wait.delete();
			return message.channel.send(deckScreen);

			async function refresh() {
				const catalog = [];
				var i = 0;
				while (i < 8) {
					const randNum = Math.floor(Math.random() * 100);
					var currentName, price;
					var currentCard;
					if (randNum < 33) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
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
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 64 || currentCard["rq"] < 50) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
					}
					else if (randNum < 91) {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 39 || currentCard["rq"] < 30) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 79 || currentCard["rq"] < 65) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
					}
					else {
						currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (i < 4) {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] > 49 || currentCard["rq"] < 40) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
						else {
							while (isOnSale(currentCard) || currentCard["isPrize"] || currentCard["rq"] < 80) {
								currentCard = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
							}
						}
					}
					currentName = `${currentCard["make"]} ${currentCard["model"]} (${currentCard["modelYear"]})`;
					price = definePrice(currentCard["rq"]);
					catalog[i] = { carFile: currentName.toLowerCase(), price: price };
					console.log(catalog[i].carFile);
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
			console.error(error);
			wait.delete();
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, failed to load in dealership.")
				.setDescription(`Something must have gone wrong. Please report this issue to the devs. \n\`${error}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
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