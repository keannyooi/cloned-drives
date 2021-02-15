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
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith('.json'));

module.exports = {
    name: "createevent",
    aliases: ["newevent"],
    usage: "<number of rounds> <event name goes here>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Creates an event with the name of your choice.",
    async execute(message, args) {
		const db = message.client.db;
        const events = await db.get("events");
		const availableRounds = [1, 3, 5, 10];

		let eventName = args.splice(1, args.length).join(" ");
		let rounds = args[0];
		let roster = [];

		if (isNaN(args[0]) || availableRounds.find(num => num === parseInt(args[0])) === undefined) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, round amount provided is either not a number or not supported.")
                .setDescription("Events currently only come in 1, 3, 5 and 10 round packages.")
                .setTimestamp();
            return message.channel.send(errorMessage);
		}
		rounds = parseInt(rounds);

        for (i = 0; i < events.length; i++) {
            if (events[i].name === eventName) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, event name already taken.")
                    .setDescription("Check the list of events using the command `cd-events`.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
            }
        }

		let carFile = [];
		for (i = 0; i < rounds; i++) {
			carFile[i] = carFiles[Math.floor(Math.random() * carFiles.length)];
		}

		carFile.sort(function (a, b) {
            const carA = require(`./cars/${a}`);
            const carB = require(`./cars/${b}`);

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

		for (let c of carFile) {
			let upgradeIndex = Math.floor(Math.random() * 4);
			let upgradePattern = [0, 0, 0];
			switch (upgradeIndex) {
				case 0:
					break;
				case 1:
					upgradePattern = [3, 3, 3];
					break;
				case 2:
					upgradePattern = [6, 6, 6];
					break;
				case 3:
					let maxedTunes = [996, 969, 699];
					let i = Math.floor(Math.random() * maxedTunes.length);
					let car = require(`./cars/${c}`);
					while (!car[`${maxedTunes[i]}TopSpeed`]) {
						i = Math.floor(Math.random() * maxedTunes.length);
					}
					upgradePattern = Array.from(maxedTunes[i].toString(), (val) => Number(val));
					break;
				default:
					break;
			}
			roster.push({
				car: c,
				gearingUpgrade: upgradePattern[0],
      			engineUpgrade: upgradePattern[1],
    			chassisUpgrade: upgradePattern[2],
				trackset: tracksets[Math.floor(Math.random() * tracksets.length)],
				requirements: {},
				reward: {}
			})
		}

        await db.push("events", { 
			name: eventName, 
			isActive: false,
			background: "https://cdn.discordapp.com/attachments/716917404868935691/801310401425440768/unknown.png",
			roster: roster,
			players: {}
		});
        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully created new event named ${eventName}!`)
			.setDescription("Apply changes to the event using `cd-editevent`.")
            .setTimestamp();
		message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(infoScreen);
    }
}