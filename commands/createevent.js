"use strict";
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
const tracksets = fs.readdirSync("./commands/tracks").filter(file => file.endsWith('.json'));
const { DateTime } = require("luxon");
module.exports = {
    name: "createevent",
    aliases: ["newevent"],
    usage: "<number of rounds> <event name goes here>",
    args: 2,
    category: "Events",
    description: "Creates an event with the name of your choice.",
    async execute(message, args) {
        const db = message.client.db;
        const events = await db.get("events");
        let eventName = args.splice(1, args.length).join(" ");
        let rounds = args[0];
        let roster = [];
        if (!message.member.roles.cache.has("802043346951340064")) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, you don't have access to this command.")
                .setDescription("This command is only accessible if you are a part of Community Management.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 10) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, round amount provided is either not a number or not supported.")
                .setDescription("The number of rounds in an event is restricted to 1 ~ 10 rounds.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        rounds = parseInt(rounds);
        let isSame = false;
        for (const [key, value] of Object.entries(events)) {
            if (key.startsWith("evnt") && eventName === value.name) {
                isSame = true;
                break;
            }
        }
        if (isSame) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, event name already taken.")
                .setDescription("Check the list of events using the command `cd-events`.")
                .setTimestamp();
            return message.channel.send(errorScreen);
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
                    upgradePattern = Array.from(maxedTunes[Math.floor(Math.random() * maxedTunes.length)].toString(), (val) => Number(val));
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
            });
        }
        await db.add(`events.currentID`, 1);
        await db.set(`events.evnt${events.currentID}`, {
            name: eventName,
            id: events.currentID,
            isActive: false,
            isVIP: false,
            timeLeft: "unlimited",
            deadline: "until someone turns it off",
            background: "https://cdn.discordapp.com/attachments/716917404868935691/801310401425440768/unknown.png",
            roster: roster,
            players: {}
        });
        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully created a new event named ${eventName}!`)
            .setDescription("Apply changes to the event using `cd-editevent`.")
            .setTimestamp();
        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(infoScreen);
    }
};
//# sourceMappingURL=createevent.js.map