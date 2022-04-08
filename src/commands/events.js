"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listUpdate = require("../util/functions/listUpdate.js");
const listRewards = require("../util/functions/listRewards.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "events",
    aliases: ["e", "event"],
    usage: ["[event name]"],
    args: 0,
    category: "Testing", //Gameplay
    description: "Views all active and inactive events.",
    async execute(message, args) {
        const events = await eventModel.find();
        if (!args.length || events.length === 0) {
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
            let page = 1, query;
            if (args.length > 1 && !isNaN(args[args.length - 1])) {
                page = parseInt(args.pop());
            }
            query = args.map(i => i.toLowerCase());

            await new Promise(resolve => resolve(search(message, query, events, "event")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await viewEvent(result, page, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function viewEvent(event, page, currentMessage) {
            // const hudPlacement = [{ x: 9, y: 59 }, { x: 9, y: 183 }, { x: 9, y: 311 }, { x: 9, y: 437 }, { x: 9, y: 565 }, { x: 383, y: 59 }, { x: 383, y: 183 }, { x: 383, y: 311 }, { x: 383, y: 437 }, { x: 383, y: 565 }];
            // const rewardPlacement = [{ x: 204, y: 57 }, { x: 204, y: 182 }, { x: 204, y: 309 }, { x: 204, y: 436 }, { x: 204, y: 563 }, { x: 587, y: 57 }, { x: 587, y: 182 }, { x: 587, y: 309 }, { x: 587, y: 436 }, { x: 587, y: 563 }];
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            console.log(event);

            if (event.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
                const { settings } = await profileModel.findOne({ userID: message.author.id });
                let list = event.roster;
                const totalPages = Math.ceil(list.length / 10);
                if (page < 1 || totalPages < page) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, page number requested invalid.",
                        desc: `The event view ends at page ${totalPages}.`,
                        author: message.author
                    }).displayClosest(page);
                    return errorMessage.sendMessage();
                }

                try {
                    await listUpdate(list, page, totalPages, listDisplay, settings, currentMessage);
                }
                catch (error) {
                    throw error;
                }

                function listDisplay(section, page, totalPages) {
                    const fields = [];
                    for (let i = 0; i < section.length; i++) {
                        let currentCar = require(`../cars/${section[i].car}`);
                        let track = require(`../tracks/${section[i].track}`);
                        let reqString = "";
                        for (const [key, value] of Object.entries(section[i].reqs)) {
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
                                        let reqCar = require(`../cars/${value}`);
                                        reqString += `\`${key}: ${carNameGen({ currentCar: reqCar, rarity: true })}\`, `;
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

                        fields.push({
                            name: `Round ${(page - 1) * 10 + i + 1}`,
                            value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: section[i].upgrade })}
                            Track: ${track["trackName"]}
                            Reqs: ${reqString}
                            Reward: ${listRewards(section[i].rewards)}`,
                            inline: true
                        });
                    }

                    // Canvas.registerFont("RobotoCondensed-Bold.ttf", { family: "Roboto Condensed" });
                    // const canvas = Canvas.createCanvas(767, 677);
                    // const ctx = canvas.getContext("2d");
                    // ctx.font = '36px "Roboto Condensed"';
                    // ctx.textAlign = "center";
                    // let attachment, promises, cucked = false;
                    // if (settings.enablegraphics && event.roster.length <= 10) {
                    //     try {
                    //         let huds = event.roster.map(car => {
                    //             let currentCar = require(`./cars/${car.car}`);
                    //             return Canvas.loadImage(currentCar[`racehud${car.gearingUpgrade}${car.engineUpgrade}${car.chassisUpgrade}`]);
                    //         });
                    //         promises = await Promise.all(huds);
                    //         let overlay = await Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/801292983496474624/test.png");
                    //         let background = await Canvas.loadImage(event.background);
                    //         ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
                    //         ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
                    //         ctx.strokeStyle = "#000000";
                    //         for (y = 0; y < event.roster.length; y++) {
                    //             console.log(y);
                    //             ctx.drawImage(promises[y], hudPlacement[y].x, hudPlacement[y].y, 171, 103);
                    //             for (let [key, value] of Object.entries(event.roster[y].reward)) {
                    //                 switch (key) {
                    //                     case "money":
                    //                         ctx.fillStyle = "#8ac545";
                    //                         ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                    //                         ctx.strokeText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                    //                         break;
                    //                     case "fuseTokens":
                    //                         ctx.fillStyle = "#4800ff";
                    //                         ctx.fillText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                    //                         ctx.strokeText(value, rewardPlacement[y].x + 88, rewardPlacement[y].y + 65);
                    //                         break;
                    //                     case "car":
                    //                         let car = require(`./cars/${event.roster[y].reward.car}`);
                    //                         let card = await Canvas.loadImage(car["card"]);
                    //                         ctx.drawImage(card, rewardPlacement[y].x, rewardPlacement[y].y, 172, 105);
                    //                         break;
                    //                     case "pack":
                    //                         let pack = require(`./packs/${event.roster[y].reward.pack}`);
                    //                         let packPic = await Canvas.loadImage(pack["pack"]);
                    //                         ctx.drawImage(packPic, rewardPlacement[y].x, rewardPlacement[y].y, 172, 105);
                    //                         break;
                    //                     default:
                    //                         break;
                    //                 }
                    //             }
                    //             if (event.roster[y].reward.trophies) {
                    //                 ctx.fillStyle = "#ff9c0d";
                    //                 ctx.fillText(event.roster[y].reward.trophies, rewardPlacement[y].x + 88, rewardPlacement[y].y + 95);
                    //                 ctx.strokeText(event.roster[y].reward.trophies, rewardPlacement[y].x + 88, rewardPlacement[y].y + 95);
                    //             }
                    //         }
                    //     }
                    //     catch (error) {
                    //         console.log(error);
                    //         attachment = new Discord.MessageAttachment(failedToLoadImageLink, "event.png");
                    //         cucked = true;
                    //     }
                    //     if (!cucked) {
                    //         attachment = new Discord.MessageAttachment(canvas.toBuffer(), "event.png");
                    //     }
                    //     infoMessage.attachFiles(attachment);
                    //     infoMessage.setImage("attachment://event.png");
                    // }

                    const infoMessage = new InfoMessage({
                        channel: message.channel,
                        title: event.name,
                        desc: `This event's active status: **${event.isActive}**
                        Event ID: \`${event.eventID}\`
                        Time Remaining: ${event.deadline.length > 10 ? `<t:${event.deadline.toUnixInteger() * 1000}:R>` : `\`${event.deadline}\``}`,
                        author: message.author,
                        image: event.background,
                        fields,
                        footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                    });
                    return infoMessage;
                }
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you do not have the necessary role to view this event right now.",
                    desc: "The event you are trying to view is not active currently. You may only view this event if you're an <@&917685033995751435>.",
                    author: message.author,
                });
                return errorMessage.sendMessage();
            }
        }

        function eventDisplay(events) {
            if (events.length > 0) {
                let eventList = "";
                for (let event of events) {
                    let intervalString = "";
                    if (event.isActive && event.timeLeft !== "unlimited") {
                        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline));
                        if (interval.invalid === null) {
                            let days = Math.floor(interval.length("days"));
                            let hours = Math.floor(interval.length("hours") - (days * 24));
                            let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
                            let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
                            intervalString = `\`${days}d ${hours}h ${minutes}m ${seconds}s\``;
                        }
                        else {
                            intervalString = `\`currently ending, no longer playable\`\n`;
                        }
                    }
                    else if (event.isActive) {
                        intervalString = `\`unlimited time remaining\`\n`;
                    }
                    eventList += `${event.name} ${intervalString}\n`;
                }
                return eventList;
            }
            else {
                return "There are currently no events under this category.\n";
            }
        }
    }
};