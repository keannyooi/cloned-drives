/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

import Discord from "discord.js";
import Canvas from "canvas";
import { rarityCheck, carNameGen, getButtons } from "./primary";
import { ErrorMessage, InfoMessage } from "./classes";

async function assignIndex(message, deck, currentRound, graphics) {
	const raceCommand = require("./race.js");
	const wait = message.channel.send("**Loading deck screen, this may take a while... (please wait)**");
	const filter = response => {
		return response.author.id === message.author.id;
	};

	let opponentList = "", trackList = "";
	for (let i = 0; i < 5; i++) {
		let car = require(`../cars/${currentRound["hand"][i]}`);
		let track = require(`../tracksets/${currentRound["tracksets"][i]}`);
		let make = car["make"];
		if (typeof make === "object") {
			make = car["make"][0];
		}
		let rarity = rarityCheck(message, car);

		opponentList += `${i + 1} - (${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentRound["tunes"][i]}]\n`;
		trackList += `${i + 1} - ${track.trackName}\n`;
	}

	let deckScreen = new Discord.MessageEmbed()
		.setColor("#34aeeb")
		.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
		.setTitle("Assign the cards in your deck to their respective indexes, from left to right.")
		.setDescription("Make sure the indexes are seperated with a space, for example `1 2 3 4 5`.")
		.addFields(
			{ name: "Opponents", value: opponentList, inline: true },
			{ name: "Tracksets", value: trackList, inline: true }
		)
		.setTimestamp();

	if (graphics) {
		let attachment;
		try {
			const opponentPlacement = [{ x: 55, y: 63 }, { x: 195, y: 63 }, { x: 335, y: 63 }, { x: 475, y: 63 }, { x: 616, y: 63 }];
			const handPlacement = [{ x: 96, y: 301 }, { x: 236, y: 301 }, { x: 377, y: 301 }, { x: 517, y: 301 }, { x: 657, y: 301 }];
			const canvas = Canvas.createCanvas(794, 390);
			const ctx = canvas.getContext("2d");
			const track1 = require(`../tracksets/${currentRound["tracksets"][0]}`);

			const [foreground, background] = await Promise.all([
				await Canvas.loadImage("https://cdn.discordapp.com/attachments/715771423779455077/848829168234135552/deck_thing.png"),
				await Canvas.loadImage(track1["background"])
			]);
			ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
			ctx.drawImage(foreground, 0, 0, canvas.width, canvas.height);

			for (let i = 0; i < 5; i++) {
				let playerCar = require(`../cars/${deck["hand"][i]}`);
				let opponentCar = require(`../cars/${currentRound["hand"][i]}`);
				let [playerHud, opponentHud] = await Promise.all([
					Canvas.loadImage(playerCar[`racehud${deck["tunes"][i]}`]),
					Canvas.loadImage(opponentCar[`racehud${currentRound["tunes"][i]}`])
				]);
				ctx.drawImage(playerHud, handPlacement[i].x, handPlacement[i].y, 126, 76);
				ctx.drawImage(opponentHud, opponentPlacement[i].x, opponentPlacement[i].y, 126, 76);
			}

			attachment = new Discord.MessageAttachment(canvas.toBuffer(), "deck.png");
		}
		catch (error) {
			console.log(error);
			let errorPic = "https://cdn.discordapp.com/attachments/716917404868935691/786411449341837322/unknown.png";
			attachment = new Discord.MessageAttachment(errorPic, "deck.png");
		}

		deckScreen.attachFiles(attachment);
		deckScreen.setImage("attachment://deck.png");
	}
	(await wait).delete();

	let result = 0;
	await message.channel.send(deckScreen);
	await message.channel.awaitMessages(filter, {
		max: 1,
		time: 180000,
		errors: ["time"]
	})
		.then(async collected => {
			let indexes = collected.first().content.split(" ");
			if (message.channel.type === "text") {
				collected.first().delete();
			}
			if (indexes.length < 5) {
				result = "kekw";
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, indexes provided incomplete.")
					.setDescription("Where should the other cards go?")
					.addField("Indexes Received", `\`${indexes}\` (less than 5 indexes detected)`)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
			else if (indexes.find(i => isNaN(i) || i < 1 || i > 5) !== undefined) {
				result = "kekw";
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, indexes provided invalid.")
					.setDescription("All indexes provided must be a number between `1 ~ 5`.")
					.addField("Indexes Received", `\`${indexes}\` (at least 1 index either not a number or not within the range of 1 and 5)`)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
			else if ((new Set(indexes).size !== indexes.length)) {
				result = "kekw";
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, duplicate index values detected.")
					.setDescription("You may not assign 2 cards into the same spot.")
					.addField("Indexes Received", `\`${indexes}\` (at least 2 indexes found to be the same)`)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}

			for (let i = 0; i < 5; i++) {
				let player = createCar({
					carFile: deck["hand"][parseInt(indexes[i] - 1)],
					gearingUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][0]),
					engineUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][1]),
					chassisUpgrade: parseInt(deck["tunes"][parseInt(indexes[i] - 1)][2])
				});
				let opponent = createCar({
					carFile: currentRound["hand"][i],
					gearingUpgrade: parseInt(currentRound["tunes"][i][0]),
					engineUpgrade: parseInt(currentRound["tunes"][i][1]),
					chassisUpgrade: parseInt(currentRound["tunes"][i][2])
				});
				let track = require(`../tracksets/${currentRound["tracksets"][i]}`);
				result += await raceCommand.race(message, player, opponent, track);
			}
		})
		.catch(error => {
			console.log(error);
			result = "kekw";
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const cancelMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Action cancelled automatically.")
				.setTimestamp();
			return message.channel.send(cancelMessage);
		});

	if (result !== "kekw") {
		result = Math.round((result + Number.EPSILON) * 100) / 100;
		if (result > 0) {
			const winMessage = new Discord.MessageEmbed()
				.setColor("#03fc24")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`You won by ${result} points!`)
				.setDescription("Winner winner chicken dinner!")
				.setTimestamp();
			message.channel.send(winMessage);
		}
		else if (result === 0) {
			const tieMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("You tied with the oppoenent!")
				.setDescription("That is indeed very unlikely to happen.")
				.setTimestamp();
			message.channel.send(tieMessage);
		}
		else {
			const loseMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`You lost by ${Math.abs(result)} points.`)
				.setDescription("*(evil morty theme song plays in the background)*")
				.setTimestamp();
			message.channel.send(loseMessage);
		}
	}
	return result;

	function createCar(currentCar) {
		const car = require(`../cars/${currentCar.carFile}`);
		let make = car["make"];
		if (typeof make === "object") {
			make = car["make"][0];
		}

		const carModule = {
			rq: car["rq"],
			topSpeed: car["topSpeed"],
			accel: car["0to60"],
			handling: car["handling"],
			driveType: car["driveType"],
			tyreType: car["tyreType"],
			weight: car["weight"],
			gc: car["gc"],
			tcs: car["tcs"],
			abs: car["abs"],
			mra: car["mra"],
			ola: car["ola"],
			racehud: car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`]
		};

		if (currentCar.gearingUpgrade > 0) {
			carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`];
			carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`];
			carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`];
		}
		if (carModule.topSpeed < 100) {
			carModule.mra = 0;
		}
		if (carModule.topSpeed < 30) {
			carModule.ola = 0;
		}

		return carModule;
	}
}

async function search(message, query, searchList, type) {
	const filter = response => {
		return response.author.id === message.author.id;
	};

	const searchResults = searchList.filter(function (s) {
		let test = listGen(message, s, type).toLowerCase().split(" ");
		let matches = query.every(part => test.includes(part));
		return (type === "user" && s[1].nickname !== null) ? (matches || s[1].nickname.toLowerCase().includes(part)) : matches;
	});

	if (searchResults.length > 1) {
		let list = "";
		for (i = 1; i <= searchResults.length; i++) {
			let hmm = listGen(message, searchResults[i - 1], type, true);
			list += `${i} - ${hmm}\n`;
		}

		if (list.length > 2048) {
			const errorMessage = new ErrorMessage(
				"too many search results.",
				"Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword."
			);
			return sendMessage(message, errorMessage.create(message).addField("Total Characters in List", `\`${list.length}\` > \`2048\``));
		}

		const infoScreen = new InfoMessage(
			"Multiple results found, please type one of the following.",
			list,
			null,
			"You have been given 1 minute to decide."
		);
		const currentMessage = await sendMessage(message, infoScreen.create(message), null, true);
		const collected = await message.channel.awaitMessages({
			filter,
			max: 1,
			time: 60000,
			errors: ["time"]
		});

		try {
			if (!message.channel.type.includes("DM")) {
				collected.first().delete();
			}
			if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
				const errorMessage = new ErrorMessage(
					"invalid integer provided.",
					`It looks like your response was either not a number or not within \`1\` and \`${searchResults.length}\`.`,
					collected.first().content
				);
				return sendMessage(message, errorMessage.create(message), null, false, currentMessage);
			}
			else {
				return [searchResults[parseInt(collected.first().content) - 1], currentMessage];
			}
		}
		catch (error) {
			const infoMessage = new InfoMessage(
				"Action cancelled automatically.",
				"I can only wait for your response for 1 minute. Act quicker next time."
			)
			return sendMessage(message, infoMessage.create(message), false, currentMessage);
		}
	}
	else if (searchResults.length > 0) {
		return [searchResults[0]];
	}
	else {
		const errorMessage = new ErrorMessage(
			"query provided yielded no results.",
			"Well that sucks.",
			query.join(" "),
			searchList.map(i => listGen(message, i, type, true).toLowerCase())
		)
		return sendMessage(message, errorMessage.create(message));
	}

	function listGen(message, item, type, includeBrackets) {
		switch (type) {
			case "car":
				let getDetails = require(`../cars/${item}`);
				let a = carNameGen(message, getDetails);
				if (!includeBrackets) {
					a = a.replace("(", "").replace(")", "");
				}
				return a;
			case "pack":
			case "track":
				return getDetails[`${type}Name`];
			case "id":
				return typeof item === "string" ? item.slice(item.length - 12, item.length - 6) : item.id;
			case "user":
				return `${item[1].user.username}#${item[1].user.discriminator}`;
			default:
				return item.name;
		}
	}
}

function sortCars(message, list, sort, order, garage) {
	return list.sort(function (a, b) {
		let carA, carB;
		if (typeof a === "string") {
			carA = require(`../cars/${a}`);
			carB = require(`../cars/${b}`);
		}
		else {
			carA = require(`../cars/${a.carID}.json`);
			carB = require(`../cars/${b.carID}.json`);
		}

		let critA = carA[sort], critB = carB[sort];
		if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
			let checkOrder = ["333", "666", "699", "969", "996"];
			let format = sort.charAt(0).toUpperCase() + sort.slice(1);
			for (let upg of checkOrder) {
				if (a[upg] > 0) {
					critA = carA[`${upg}${format}`];
				}
				if (b[upg] > 0) {
					critB = carB[`${upg}${format}`];
				}
			}
		}
		else if (sort === "mostowned") {
			let fileA = a, fileB = b;
			if (garage) {
				fileA = garage.find(c => a.includes(c.carID));
				fileB = garage.find(c => b.includes(c.carID));
			}
			critA = fileA["000"] + fileA["333"] + fileA["666"] + fileA["996"] + fileA["969"] + fileA["699"];
			critB = fileB["000"] + fileB["333"] + fileB["666"] + fileB["996"] + fileB["969"] + fileB["699"];
		}

		if (critA === critB) {
			return carNameGen(message, carA) > carNameGen(message, carB) ? 1 : -1;
		}
		else {
			let someBool = (sort === "0to60" || sort === "weight" || sort === "ola");
			if ((order === "ascending") ? !someBool : someBool) { //basically a logical XOR gate
				return critA - critB;
			}
			else {
				return critB - critA;
			}
		}
	});
}

async function listDisplay(message, user, page, garage, sort, playerData, currentMessage) {
	const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
	let reactionIndex = 0, pageLimit = 10;
	let startsWith, endsWith;
	const totalPages = Math.ceil(garage.length / pageLimit);

	if (garage.length - pageLimit <= 0) {
		startsWith = 0;
		endsWith = garage.length;
		reactionIndex = 0;
	}
	else if (page * pageLimit === pageLimit) {
		startsWith = 0;
		endsWith = pageLimit;
		reactionIndex = 1;
	}
	else if (garage.length - (pageLimit * page) <= 0) {
		startsWith = pageLimit * (page - 1);
		endsWith = garage.length;
		reactionIndex = 2;
	}
	else {
		startsWith = pageLimit * (page - 1);
		endsWith = startsWith + pageLimit;
		reactionIndex = 3;
	}
	let garageList = "", amountList = "", valueList = "";

	for (i = startsWith; i < endsWith; i++) {
		garageList += `**${i + 1 - ((page - 1) * 10)}.** `;
		amountList += `**${i + 1 - ((page - 1) * 10)}.** `;
		valueList += `**${i + 1 - ((page - 1) * 10)}.** `;
		//console.log(garage[i]);
		let currentCar = require(`../cars/${garage[i].carID}.json`);
		let make = currentCar["make"];
		if (typeof make === "object") {
			make = currentCar["make"][0];
		}
		let rarity = rarityCheck(message, currentCar["rq"], playerData.settings.shortenedlists);

		garageList += carNameGen(message, currentCar, rarity);
		for (const [key, value] of Object.entries(garage[i])) {
			if (!isNaN(value) && value > 0) {
				amountList += `${key} x${value}, `;
			}
		}
		if (currentCar["isPrize"]) {
			if (playerData.settings.shortenedlists) {
				garageList += ` 🏆`;
			}
			else {
				garageList += ` ${trophyEmoji}`;
			}
		}
		garageList += "\n";
		amountList = amountList.slice(0, -2);
		amountList += "\n";

		if (sort === "mostowned") {
			valueList += `\`${garage[i]["000"] + garage[i]["333"] + garage[i]["666"] + garage[i]["996"] + garage[i]["969"] + garage[i]["699"]}\`\n`;
		}
		else if (sort !== "rq") {
			let thonk = "";
			if (sort === "topSpeed" || sort === "0to60" || sort === "handling") {
				for (let [key, value] of Object.entries(garage[i])) {
					if (!isNaN(value) && value > 0 && thonk.includes(key) === false) {
						let clarkson = currentCar[sort];
						if (key !== "000") {
							clarkson = currentCar[`${key}${sort.charAt(0).toUpperCase() + sort.slice(1)}`];
						}
						if (!thonk.includes(clarkson)) {
							thonk += `${clarkson}, `;
						}
					}
				}
				thonk = thonk.slice(0, -2);
			}
			else {
				thonk = currentCar[sort];
			}
			valueList += `\`${thonk}\`\n`;
		}
	}
	if (garageList.length > 1024) {
		const errorMessage = new ErrorMessage(
			"this page has too many characters and thus cannot be shown due to Discord's embed limitations.",
			"Try turning on `Shortened Lists` in `cd-settings`."
		)
		return sendMessage(message, errorMessage.create(message));
	}

	let { firstPage, prevPage, nextPage, lastPage } = getButtons("menu", playerData.settings.buttonstyle);
	let infoMessage = new InfoMessage(
		`${user.username}'s Garage`,
		`Current Sorting Criteria: \`${sort}\`, Filter Activated: \`${(playerData.filter !== undefined && playerData.settings.filtergarage === true)}\``,
		null,
		`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`,
		user.displayAvatarURL({ format: "png", dynamic: true })
	).create(message);

	infoMessage.addField("Car", garageList, true).addField("Amount", amountList, true);
	if (sort !== "rq") {
		infoMessage.addField("Values", valueList, true);
	}

	switch (reactionIndex) {
		case 0:
			firstPage.setDisabled(true);
			prevPage.setDisabled(true);
			nextPage.setDisabled(true);
			lastPage.setDisabled(true);
			break;
		case 1:
			firstPage.setDisabled(true);
			prevPage.setDisabled(true);
			nextPage.setDisabled(false);
			lastPage.setDisabled(false);
			break;
		case 2:
			firstPage.setDisabled(false);
			prevPage.setDisabled(false);
			nextPage.setDisabled(true);
			lastPage.setDisabled(true);
			break;
		case 3:
			firstPage.setDisabled(false);
			prevPage.setDisabled(false);
			nextPage.setDisabled(false);
			lastPage.setDisabled(false);
			break;
		default:
			break;
	}
	let row = new Discord.MessageActionRow().addComponents(firstPage, prevPage, nextPage, lastPage);
	let listMessage = await sendMessage(message, infoMessage, row, false, currentMessage);
	return { listMessage: listMessage, embed: infoMessage };
}

function filterCheck(message, car, filter) {
    let currentCar = typeof car === "string" ? require(`../cars/${car}`) : require(`../cars/${carFiles.find(f => f.includes(car.carID))}`);
    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (Array.isArray(value)) {
                    if (Array.isArray(currentCar[key])) {
                        let obj = {};
                        currentCar[key].forEach((tag, index) => obj[tag.toLowerCase()] = index);
                        return value.every(tagFilter => obj[tagFilter] !== undefined);
                    }
                    else {
                        return value.includes(currentCar[key].toLowerCase());
                    }
                }
                else {
                    return currentCar[key] >= value.start && currentCar[key] <= value.end;
                }
            case "string":
                if (key === "search") {
                    return carNameGen(message, currentCar).toLowerCase().includes(value);
                }
                else {
                    return currentCar[key].toLowerCase() === value;
                }
            case "boolean":
                switch (key) {
                    case "isPrize":
                        return currentCar[key] === value;
                    case "isStock":
                        return (car["000"] > 0) === value;
                    case "isUpgraded":
                        return (car["333"] + car["666"] + car["996"] + car["969"] + car["699"] > 0) === value;
                    case "isMaxed":
                        return (car["996"] + car["969"] + car["699"] > 0) === value;
                    case "isOwned":
                        return true;
                    default:
                        break;
                }
            default:
                return;
        }
    }
}

export {
	assignIndex,
	search,
	sortCars,
	listDisplay,
	filterCheck
};