/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const Canvas = require("canvas");

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    usage: "(optional) <event name>",
    args: 0,
	isExternal: false,
    adminOnly: false,
    description: "Views all active and inactive events.",
    async execute(message, args) {
		const db = message.client.db;
		const events = await db.get("events");
		const hudPlacement = [{ x: 9, y: 59 }, { x: 9, y: 183 }, { x: 9, y: 311 }, { x: 9, y: 437 }, { x: 9, y: 565 }, { x: 383, y: 59 }, { x: 383, y: 183 }, { x: 383, y: 311 }, { x: 383, y: 437 }, { x: 383, y: 565 }];
		const rewardPlacement = [{ x: 204, y: 57 }, { x: 204, y: 182 }, { x: 204, y: 309 }, { x: 204, y: 436 }, { x: 204, y: 563 }, { x: 587, y: 57 }, { x: 587, y: 182 }, { x: 587, y: 309 }, { x: 587, y: 436 }, { x: 587, y: 563 }];

        if (!args.length) {
			let activeEvents = events.filter(event => {
				return event.isActive === true;
			});
			let inactiveEvents = events.filter(event => {
				return event.isActive === false;
			});
			let activeEventList = eventDisplay(activeEvents);
			let inactiveEventList = eventDisplay(inactiveEvents);

            let listMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Events")
                .addFields(
					{ name: "Active Events", value: activeEventList },
					{ name: "Inactive Events", value: inactiveEventList }
				)
                .setFooter("More info about an event can be found by using cd-events <event name>.")
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(listMessage);
        }
        else {
            const eventName = args.join(" ").toLowerCase();
            const event = events.find(event => {
				return event.name.toLowerCase().includes(eventName);
			});

            if (!event) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, 404 event not found.")
                    .setDescription("It looks like this event doesn't exist. Try referring to the event list.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
			console.log(event);
			
			if (event.isActive || message.member.roles.cache.has("802043346951340064")) {
				const wait = await message.channel.send("**Loading event display, this may take a while... (please wait)**");
				const infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(event.name)
					.setDescription(`This event's active status: **${event.isActive}**`)
					.setTimestamp();

				for (i = 0; i < event.roster.length; i++) {
					let car = require(`./cars/${event.roster[i].car}`);
					let make = car["make"];
					let upgrade = `${event.roster[i].gearingUpgrade}${event.roster[i].engineUpgrade}${event.roster[i].chassisUpgrade}`;
					if (typeof make === "object") {
						make = car["make"][0];
					}

					let track = require(`./tracksets/${event.roster[i].trackset}`);
					let emoji, rewardString = "", reqString = "";

					for (const [key, value] of Object.entries(event.roster[i].requirements)) {
						switch (typeof value) {
							case "object":
								reqString += `\`${key}: ${value.start} - ${value.end}\`, `;
								break;
							case "boolean":
							case "string":
								if (key === "car") {
									let reqCar = require(`./cars/${value}`);
									let reqMake = reqCar["make"];
									if (typeof reqMake === "object") {
										reqMake = reqCar["make"][0];
									}
									reqString += `\`${key}: ${reqMake} ${reqCar["model"]} (${reqCar["modelYear"]})\`, `;
								}
								else {
									reqString += `\`${key}: ${value}\`, `;
								}
								break;
							default:
								break;
						}
					}
					if (reqString === "") {
						reqString = "Open Match";
					}
					else {
						reqString = reqString.slice(0, -2);
					}

					for (let [key, value] of Object.entries(event.roster[i].reward)) {
						switch (key) {
							case "money":
								emoji = message.client.emojis.cache.get("726017235826770021"); 
								rewardString = `${emoji}${value}`;
								break;
							case "fuseTokens":
								emoji = message.client.emojis.cache.get("726018658635218955");
								rewardString = `${emoji}${value}`; 
								break;
							case "car":
								let car = require(`./cars/${event.roster[i].reward.car}`);
								let rarity = rarityCheck(car);
								let make2 = car["make"];
								if (typeof make2 === "object") {
									make2 = car["make"][0];
								}
								rewardString = `(${rarity} ${car["rq"]}) ${make2} ${car["model"]} (${car["modelYear"]})`;
								break;
							case "pack":
								let pack = require(`./packs/${event.roster[i].reward.pack}`);
								rewardString = pack["packName"];
								break;
							default:
								break;
						}
					}
					if (event.roster[i].reward.trophies) {
						emoji = message.client.emojis.cache.get("775636479145148418"); 
						if (rewardString === "") {
							rewardString = `${emoji}${event.roster[i].reward.trophies}`;
						}
						else {
							rewardString += `, ${emoji}${event.roster[i].reward.trophies}`;
						}
					}
					if (rewardString === "") {
						rewardString = "None";
					}
					
					infoScreen.addField(`Round ${i + 1}`, `Car: ${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]
					Trackset: ${track["trackName"]}
					Requirements: ${reqString}
					Reward: ${rewardString}`, true);
				}

				Canvas.registerFont("RobotoCondensed-Bold.ttf", { family: "Roboto Condensed" });
				const canvas = Canvas.createCanvas(767, 677);
				const ctx = canvas.getContext('2d');
				ctx.font = '36px "Roboto Condensed"';
				ctx.textAlign = "center";
				let attachment, promises, cucked = false;
				try {
					let huds = event.roster.map(car => {
						let currentCar = require(`./cars/${car.car}`);
						return Canvas.loadImage(currentCar[`racehud${car.gearingUpgrade}${car.engineUpgrade}${car.chassisUpgrade}`]);
					});
					promises = await Promise.all(huds);

					let overlay = await Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/801292983496474624/test.png");
					let background = await Canvas.loadImage(event.background);
					ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
					ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
					
					for (y = 0; y < event.roster.length; y++) {
						console.log(y);
						ctx.drawImage(promises[y], hudPlacement[y].x, hudPlacement[y].y, 171, 103);

						for (let [key, value] of Object.entries(event.roster[y].reward)) {
							switch (key) {
								case "money":
									ctx.fillStyle = "#8ac545";
									ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
									break;
								case "fuseTokens":
									ctx.fillStyle = "#4800ff";
									ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
									break;
								case "car":
									let car = require(`./cars/${event.roster[y].reward.car}`);
									let card = await Canvas.loadImage(car["card"]);
									ctx.drawImage(card, rewardPlacement[y].x, rewardPlacement[y].y, 172, 105);
									break;
								case "pack":
									let pack = require(`./packs/${event.roster[y].reward.pack}`);
									let packPic = await Canvas.loadImage(pack["pack"]);
									ctx.drawImage(packPic, rewardPlacement[y].x, rewardPlacement[y].y, 172, 105);
									break;
								default:
									break;
							}
						}
						if (event.roster[y].reward.trophies) {
							ctx.fillStyle = "#ff9c0d";
							ctx.fillText(event.roster[y].reward.trophies, rewardPlacement[y].x + 88, rewardPlacement[y].y + 95);
						}
					}
				}
				catch (error) {
					console.log(error);
					let errorPic = "https://cdn.discordapp.com/attachments/716917404868935691/801370166826238002/unknown.png";
					attachment = new Discord.MessageAttachment(errorPic, "event.png");
					cucked = true;
				}

				if (!cucked) {
					attachment = new Discord.MessageAttachment(canvas.toBuffer(), "event.png");
				}
				infoScreen.attachFiles(attachment);
				infoScreen.setImage("attachment://event.png");
				wait.delete();
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				return message.channel.send(infoScreen);
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, this event is not viewable yet.")
					.setDescription("The event you are trying to view is not active currently. This is only bypassable if you are a part of Community Management.")
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
        }

        function eventDisplay(events) {
            if (events.length > 0) {
				let eventList = "";
				for (let event of events) {
					eventList += `${event.name}\n`;
				}
				return eventList;
			}
			else {
				return "There are currently no events under this category.\n";
			}
        }

		function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("726025494138454097");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("726025394104434759");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.client.emojis.cache.get("726025302656024586");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.client.emojis.cache.get("726025273421725756");
            }
            else { //common
                return message.client.emojis.cache.get("726020544264273928");
            }
        }
    }
}