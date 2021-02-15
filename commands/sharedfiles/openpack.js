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
const carFiles = fs.readdirSync('./commands/cars').filter(file => file.endsWith('.json'));

module.exports = {
	openPack(message, currentPack) {
		const cardFilter = currentPack["filter"];

		let rand, check;
		let rqStart, rqEnd;
		let currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		let pulledCards = "";
		let addedCars = [];

		for (i = 0; i < 5; i++) {
			console.log(i);
			rand = Math.floor(Math.random() * 100);
			check = 0;
			for (let rarity of Object.keys(currentPack["packSequence"][i])) {
				check += currentPack["packSequence"][i][rarity];
				if (check > rand) {
					switch (rarity) {
						case "common":
							rqStart = 1;
							rqEnd = 19;
							break;
						case "uncommon":
							rqStart = 20;
							rqEnd = 29;
							break;
						case "rare":
							rqStart = 30;
							rqEnd = 39;
							break;
						case "superRare":
							rqStart = 40;
							rqEnd = 49;
							break;
						case "ultraRare":
							rqStart = 50;
							rqEnd = 64;
							break;
						case "epic":
							rqStart = 65;
							rqEnd = 79;
							break;
						case "legendary":
							rqStart = 80;
							rqEnd = 999;
							break;
						default:
							break;
					}
					break;
				}
			}

			let carFile = carFiles[Math.floor(Math.random() * carFiles.length)];
			currentCard = require(`../cars/${carFile}`);
			while (currentCard["rq"] < rqStart || currentCard["rq"] > rqEnd || filterCard(currentCard, cardFilter) === false) {
				carFile = carFiles[Math.floor(Math.random() * carFiles.length)];
				currentCard = require(`../cars/${carFile}`);
			}
			addedCars.push(carFile);
		}

		addedCars.sort(function (a, b) {
            const carA = require(`../cars/${a}`);
            const carB = require(`../cars/${b}`);

            if (carA["rq"] === carB["rq"]) {
                let nameA = `${carA["make"]} ${carA["model"]}`.toLowerCase();
                let nameB = `${carA["make"]} ${carA["model"]}`.toLowerCase();
				if (typeof carA["make"] === "object") {
					nameA = `${carA["make"][0]} ${carA["model"]}`.toLowerCase();
				}
				if (typeof carB["make"] === "object") {
					nameB = `${carB["make"][0]} ${carB["model"]}`.toLowerCase();
				}

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
                if (carA["rq"] > carB["rq"]) {
                    return 1;
                }
                else {
                    return -1;
                }
            }
        });

		for (i = 0; i < addedCars.length; i++) {
			let currentCard = require(`../cars/${addedCars[i]}`);
			let rarity = rarityCheck(currentCard);
			let make = currentCard["make"];
			if (typeof make === "object") {
				make = currentCard["make"][0];
			}
			pulledCards += `(${rarity} ${currentCard["rq"]}) ${make} ${currentCard["model"]} (${currentCard["modelYear"]})\n`;
		}
		let d = require(`../cars/${addedCars[addedCars.length - 1]}`);

		let packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("Click on the image to see the cards better.")
			.setThumbnail(currentPack["pack"])
			.setImage(d["card"])
			.addField("Cards Pulled:", pulledCards)
			.setTimestamp();
		message.channel.send(packScreen);
		return addedCars;

		function filterCard(currentCard, filter) {
			let passed = true;
			if (currentCard["isPrize"] === false) {
				for (let criteria in filter) {
					if (filter[criteria] !== "None") {
						switch (criteria) {
							case "modelYear":
								if (currentCard["modelYear"] < filter["modelYear"]["start"] || currentCard["modelYear"] > filter["modelYear"]["end"]) {
									passed = false;
								}
								break;
							default:
								if (currentCard[criteria] !== filter[criteria]) {
									passed = false;
								}
								break;
						}
					}
				}
			}
			else {
				passed = false;
			}
			return passed;
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