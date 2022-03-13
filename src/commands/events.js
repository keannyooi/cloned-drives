"use strict";

const bot = require("../config/config.js");
const Canvas = require("canvas");
const { DateTime, Interval } = require("luxon");
const { InfoMessage } = require("../util/classes/classes.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    usage: ["[event name]"],
    args: 0,
    category: "Gameplay",
    description: "Views all active and inactive events.",
    async execute(message, args) {
        const events = await eventModel.find();
        const { settings } = await profileModel.findOne({ userID: message.author.id });

        if (!args.length) {
            let activeEvents = events.filter(event => event.isActive === true);
            let inactiveEvents = events.filter(event => event.isActive === false);
            let activeEventList = eventDisplay(activeEvents);
            let inactiveEventList = eventDisplay(inactiveEvents);
            let listMessage = new InfoMessage({
                channel: message.channel,
                title: "Cloned Drives Events",
                author: message.author,
                fields: [
                    { name: "Active Events", value: activeEventList },
                    { name: "Inactive Events", value: inactiveEventList }
                ],
                footer: "More info about an event can be found by using cd-events <event name>."
            });
            return listMessage.sendMessage();
        }
        else {
            let eventName = args.map(i => i.toLowerCase());
            await new Promise(resolve => resolve(search(message, eventName, events, "event")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await viewEvent(result, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function viewEvent(event, currentMessage) {
            const hudPlacement = [{ x: 9, y: 59 }, { x: 9, y: 183 }, { x: 9, y: 311 }, { x: 9, y: 437 }, { x: 9, y: 565 }, { x: 383, y: 59 }, { x: 383, y: 183 }, { x: 383, y: 311 }, { x: 383, y: 437 }, { x: 383, y: 565 }];
            const rewardPlacement = [{ x: 204, y: 57 }, { x: 204, y: 182 }, { x: 204, y: 309 }, { x: 204, y: 436 }, { x: 204, y: 563 }, { x: 587, y: 57 }, { x: 587, y: 182 }, { x: 587, y: 309 }, { x: 587, y: 436 }, { x: 587, y: 563 }];
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            console.log(event);

            if (event.isActive || guildMember.roles.cache.has("917685033995751435")) {
                const wait = await message.channel.send("**Loading event display, this may take a while... (please wait)**");
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: event.name,
                    desc: `This event's active status: **${event.isActive}**
					Duration (in days): \`${event.timeLeft}\``,
                    author: message.author,
                    footer: `Event ID: ${event.id}`
                });

                for (let i = 0; i < event.roster.length; i++) {
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
                                if (Array.isArray(value)) {
                                    reqString += `\`${key}: ${value.join(" or ")}\`, `;
                                }
                                else {
                                    reqString += `\`${key}: ${value.start} - ${value.end}\`, `;
                                }
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
                    infoMessage.addField(`Round ${i + 1}`, `Car: ${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]
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
                if (settings.enablegraphics) {
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
                        ctx.strokeStyle = "#000000";
                        for (y = 0; y < event.roster.length; y++) {
                            console.log(y);
                            ctx.drawImage(promises[y], hudPlacement[y].x, hudPlacement[y].y, 171, 103);
                            for (let [key, value] of Object.entries(event.roster[y].reward)) {
                                switch (key) {
                                    case "money":
                                        ctx.fillStyle = "#8ac545";
                                        ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                                        ctx.strokeText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                                        break;
                                    case "fuseTokens":
                                        ctx.fillStyle = "#4800ff";
                                        ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                                        ctx.strokeText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
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
                                ctx.strokeText(event.roster[y].reward.trophies, rewardPlacement[y].x + 88, rewardPlacement[y].y + 95);
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
                    infoMessage.attachFiles(attachment);
                    infoMessage.setImage("attachment://event.png");
                }
                wait.delete();

                return message.channel.send(infoMessage);
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you do not have the necessary role to view this event right now.",
                    desc: "The event you are trying to view is not active currently. This is only bypassable if you have the <@&917685033995751435> role",
                    author: message.author,
                })
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle()
                    .setDescription()
                    .setTimestamp();
            }
        }

        function eventDisplay(events) {
            if (events.length > 0) {
                let eventList = "";
                for (let event of events) {
                    if (event.isActive && event.timeLeft !== "unlimited") {
                        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                        if (interval.invalid === null) {
                            let days = Math.floor(interval.length("days"));
                            let hours = Math.floor(interval.length("hours") - (days * 24));
                            let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
                            let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
                            let intervalString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                            eventList += `${event.name} \`${intervalString} remaining\`\n`;
                        }
                        else {
                            eventList += `${event.name} \`currently ending, no longer playable\`\n`;
                        }
                    }
                    else if (event.isActive) {
                        eventList += `${event.name} \`unlimited time remaining\`\n`;
                    }
                    else {
                        eventList += `${event.name}\n`;
                    }
                }
                return eventList;
            }
            else {
                return "There are currently no events under this category.\n";
            }
        }
    }
};