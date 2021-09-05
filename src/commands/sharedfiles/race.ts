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
	async race(message, player, opponent, currentTrack, graphics) {
		const wait = message.channel.send("**Loading race, please wait... (may take a while)**");

		try {
			let description = `__Selected Track: ${currentTrack["trackName"]}__`;
			let attachment;
			if (graphics) {
				try {
					const canvas = Canvas.createCanvas(674, 379);
					const ctx = canvas.getContext("2d");
	
					const [background, overlay, playerHud, opponentHud, map] = await Promise.all([
						Canvas.loadImage(currentTrack["background"]),
						Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/795177817116901386/race_template_thing.png"),
						Canvas.loadImage(player.racehud),
						Canvas.loadImage(opponent.racehud),
						Canvas.loadImage(currentTrack["map"]) ]);
		
					ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
					ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
					ctx.drawImage(playerHud, 35, 69, 186, 113);
					ctx.drawImage(opponentHud, 457, 198, 186, 112);
					ctx.drawImage(map, 258, 228, 142, 142);
		
					attachment = new Discord.MessageAttachment(canvas.toBuffer(), "thing.png");
				}
				catch (error) {
					console.log(error);
					let errorPic = "https://cdn.discordapp.com/attachments/716917404868935691/786411449341837322/unknown.png";
					attachment = new Discord.MessageAttachment(errorPic, "thing.png");
				}
			}

			const drivePlacement = ["4WD", "FWD", "RWD"];
			const gcPlacement = ["High", "Medium", "Low"];
			const result = evalScore(player, opponent);
			const raceInfo = compare(player, opponent, (result > 0));

			let raceMessage = "";
			if (result > 0) {
				raceMessage = `You won by ${result} point(s)! (insert crab rave here)`;
				colorCode = "#03fc24";
			}
			else if (result === 0) {
				raceMessage = "You tied with the opponent!";
				colorCode = "#34aeeb";
			}
			else {
				raceMessage = `You lost by ${Math.abs(result)} point(s). (press f to pay respects)`;
				colorCode = "#fc0303";
			}
			if (result !== 0) {
				description += `\nThe winning car had the following advantages: ${raceInfo}`;
			}

			let resultScreen = new Discord.MessageEmbed()
				.setColor(colorCode)
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(raceMessage)
				.setDescription(description)
				.setTimestamp();
			if (graphics) {
				resultScreen.attachFiles(attachment)
					.setImage("attachment://thing.png");
			}
			message.channel.send(resultScreen);
			(await wait).delete();
			return result;

			function compare(player, opponent, playerWon) {
				const tyrePlacement = {
					"Rainy Asphalt": ["Standard", "All-Surface", "Performance", "Off-Road", "Slick"],
					"Sunny Gravel": ["All-Surface", "Off-Road", "Standard", "Performance", "Slick"],
					"Rainy Gravel": ["Off-Road", "All-Surface", "Standard", "Performance", "Slick"],
					"Sunny Dirt": ["Off-Road", "All-Surface", "Standard", "Performance", "Slick"],
					"Rainy Dirt": ["Off-Road", "All-Surface", "Standard", "Performance", "Slick"],
					"Sunny Snow": ["Off-Road", "All-Surface", "Standard", "Performance", "Slick"],
					"Sunny Ice": ["Off-Road", "All-Surface", "Standard", "Performance", "Slick"],
				}
				let tyrePenalty = 0;
				if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
					tyrePenalty = tyrePlacement[`${currentTrack["weather"]} ${currentTrack["surface"]}`].indexOf(opponent.tyreType) - tyrePlacement[`${currentTrack["weather"]} ${currentTrack["surface"]}`].indexOf(player.tyreType);
				}

				const comparison = {
					"topSpeed": player.topSpeed - opponent.topSpeed,
					"0to60": opponent.accel - player.accel,
					"handling": player.handling - opponent.handling,
					"weight": opponent.weight - player.weight,
					"mra": player.mra - opponent.mra,
					"ola": opponent.ola - player.ola,
					"gc": gcPlacement.indexOf(opponent.gc) - gcPlacement.indexOf(player.gc),
					"driveType": drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType),
					"tyreType": tyrePenalty,
					"abs": player.abs - opponent.abs,
					"tcs": player.tcs - opponent.tcs
				}
				let response = "";
				console.log(comparison);

				for (i = 0; i < Object.keys(comparison).length; i++) {
					const compareValue = currentTrack["specsDistr"][Object.keys(comparison)[i]];
					let value = Object.values(comparison)[i];
					if (!playerWon) {
						if (value > 0) {
							value -= value * 2;
						}
						else {
							value = Math.abs(value);
						}
					}

					if (compareValue !== undefined) {
						switch (Object.keys(comparison)[i]) {
							case "topSpeed":
								if (compareValue > 0 && value > 0) {
									response += "Higher top speed, ";
								}
								break;
							case "0to60":
								if (compareValue > 0 && value > 0) {
									response += "Lower 0-60, ";
								}
								break;
							case "handling":
								if (compareValue > 0 && value > 0) {
									response += "Better handling, ";
								}
								break;
							case "weight":
								if (compareValue > 0 && value > 0) {
									response += "Lower mass, ";
								}
								break;
							case "mra":
								if (compareValue > 0 && value > 0) {
									response += "Better mid-range acceleration, ";
								}
								break;
							case "ola":
								if (compareValue > 0 && value > 0) {
									response += "Better off-the-line acceleration, ";
								}
								break;
							default:
								break;
						}
					}
					else if (value > 0) {
						switch (Object.keys(comparison)[i]) {
							case "gc":
								if (currentTrack["humps"] > 0) {
									response += "Higher ground clearance, ";
								}
								else if (currentTrack["speedbumps"] > 0 && (opponent.gc === "Low" || player.gc === "Low")) {
									response += "Higher ground clearance, ";
								}
								break;
							case "driveType":
								if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
									response += "Better drive system for the surface conditions, ";
								}
								break;
							case "tyreType":
								if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
									response += "Better tyres for the surface conditions, ";
								}
								break;
							case "abs":
								if ((currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") && currentTrack["specsDistr"]["handling"] > 0) {
									response += "ABS, ";
								}
								break;
							case "tcs":
								if (currentTrack["surface"] !== "Asphalt" || currentTrack["weather"] === "Rainy") {
									response += "Traction Control, ";
								}
								break;
							default:
								break;
						}
					}
				}

				if (response === "") {
					return "Sorry, we have no idea how you won/lost. You may vent your anger toward us.";
				}
				else {
					return response.slice(0, -2);
				}
			}

			function evalScore(player, opponent) {
				let tyreIndex;
				let score = 0;

				score += (player.topSpeed - opponent.topSpeed) * (currentTrack["specsDistr"]["topSpeed"] / 100);
				score += (opponent.accel - player.accel) * 10 * (currentTrack["specsDistr"]["0to60"] / 100);
				score += (player.handling - opponent.handling) * (currentTrack["specsDistr"]["handling"] / 100);
				score += (opponent.weight - player.weight) / 50 * (currentTrack["specsDistr"]["weight"] / 100);
				score += (player.mra - opponent.mra) / 3 * (currentTrack["specsDistr"]["mra"] / 100);
				score += (opponent.ola - player.ola) * (currentTrack["specsDistr"]["ola"] / 100);

				if (player.gc.toLowerCase() === "low") {
					score -= (10 * currentTrack["speedbumps"]);
				}
				if (opponent.gc.toLowerCase() === "low") {
					score += (10 * currentTrack["speedbumps"]);
				}
				score += (gcPlacement.indexOf(opponent.gc) - gcPlacement.indexOf(player.gc)) * 10 * currentTrack["humps"];

				let tcsPen = 0, absPen = 0;
				switch (currentTrack["surface"]) {
					case "Asphalt":
						if (currentTrack["weather"] === "Rainy") {
							score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 4;
							absPen = tcsPen = 1;

							tyreIndex = {
								"Standard": 0,
								"Performance": 11,
								"All-Surface": 5,
								"Off-Road": 25,
								"Slick": 50
							};
							score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						}
						break;
					case "Dirt":
						if (currentTrack["weather"] === "Rainy") {
							score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 8.5;
							absPen = tcsPen = 2.5;

							tyreIndex = {
								"Standard": 70,
								"Performance": 95,
								"All-Surface": 30,
								"Off-Road": 10,
								"Slick": 200
							};
							score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						}
						else {
							score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 7;
							absPen = tcsPen = 1.75;

							tyreIndex = {
								"Standard": 35,
								"Performance": 55,
								"All-Surface": 10,
								"Off-Road": 2,
								"Slick": 100
							};
							score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						}
						break;
					case "Gravel":
						if (currentTrack["weather"] === "Rainy") {
							score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 5.5;
							absPen = tcsPen = 1.25;

							tyreIndex = {
								"Standard": 7.5,
								"Performance": 25,
								"All-Surface": 2,
								"Off-Road": 3,
								"Slick": 50
							};
							score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						}
						else {
							score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 2;

							tyreIndex = {
								"Standard": 5,
								"Performance": 22.5,
								"All-Surface": 1,
								"Off-Road": 2.5,
								"Slick": 45
							};
							score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						}
						break;
					case "Snow":
						score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 12;
						absPen = tcsPen = 3;

						tyreIndex = {
							"Standard": 75,
							"Performance": 150,
							"All-Surface": 55,
							"Off-Road": 30,
							"Slick": 500
						};
						score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						break;
					case "Ice":
						score += (drivePlacement.indexOf(opponent.driveType) - drivePlacement.indexOf(player.driveType)) * 17;
						absPen = tcsPen = 4.25;
						tyreIndex = {
							"Standard": 125,
							"Performance": 250,
							"All-Surface": 60,
							"Off-Road": 25,
							"Slick": 1000
						};
						score += (tyreIndex[opponent.tyreType] - tyreIndex[player.tyreType]);
						break;
					default:
						break;
				}
				score += (player.tcs - opponent.tcs) * tcsPen;

				//special cases
				if (currentTrack["trackName"].includes("0-100MPH")) {
					if (opponent.topSpeed < 100 && player.topSpeed >= 100) {
						score = 250;
					}
					else if (opponent.topSpeed >= 100 && player.topSpeed < 100) {
						score = -250;
					}
					else if (opponent.topSpeed < 100 && player.topSpeed < 100) {
						if (opponent.topSpeed < player.topSpeed) {
							score = 50;
						}
						else if (opponent.topSpeed > player.topSpeed) {
							score = -50;
						}
						else {
							score = 0;
						}
					}
				}
				if (currentTrack["specsDistr"]["handling"] > 0) {
					score += (player.abs - opponent.abs) * absPen;
				}
				return Math.round((score + Number.EPSILON) * 100) / 100;
			}
		}
		catch (error) {
			console.error(error);
			wait.delete();
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, failed to load race.")
				.setDescription(`Something must have gone wrong. Please report this issure to the devs.\n\`${error}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
}