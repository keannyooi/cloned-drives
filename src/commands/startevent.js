"use strict";

const bot = require("../config/config.js");
const { MessageAttachment } = require("discord.js");
const { DateTime } = require("luxon");
const { registerFont, loadImage, createCanvas } = require("canvas");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime, failedToLoadImageLink, moneyEmojiID, fuseEmojiID, trophyEmojiID, glofEmojiID, packEmojiID } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "startevent",
    aliases: ["launchevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive event.",
    async execute(message, args) {
        const events = await eventModel.find({});
        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startEvent(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startEvent(event, currentMessage) {
            if (event.isActive === true) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this event is already active.",
                    desc: "Check the active status for all events using `cd-events`.",
                    author: message.author,
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${event.name} event?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                event.isActive = true;
                if (event.deadline.length < 9) {
                    event.deadline = DateTime.now().plus({ days: parseInt(event.deadline[0]) }).toISO();
                }

                registerFont("RobotoCondensed-Bold.ttf", { family: "Roboto Condensed" });
                const canvas = createCanvas(903 * Math.ceil(event.roster.length / 5), 299 * (event.roster.length <= 5 ? event.roster.length : 5));
                const ctx = canvas.getContext("2d");
                let attachment, cucked = false;

                try {
                    let huds = event.roster.map(car => {
                        let currentCar = require(`../cars/${car.carID}`);
                        return loadImage(currentCar[`racehud${car.upgrade}`]);
                    });
                    let maps = event.roster.map(track => {
                        let currentTrack = require(`../tracks/${track.track}`);
                        return loadImage(currentTrack["map"]);
                    });
                    let hudPromises = await Promise.all(huds);
                    let mapPromises = await Promise.all(maps);
                    ctx.fillStyle = "#ffffff";

                    for (let i = 0; i < event.roster.length; i++) {
                        let baseX = Math.floor(i / 5) * 903;
                        let baseY = (i % 5) * 299;

                        ctx.font = '41px "Roboto Condensed"';
                        ctx.textAlign = "left";
                        ctx.drawImage(bot.graphics.eventTemp, baseX, baseY);
                        ctx.drawImage(hudPromises[i], baseX + 13, baseY + 59, 374, 224);
                        ctx.drawImage(mapPromises[i], baseX + 482, baseY + 190, 98, 98);
                        ctx.fillText(i + 1, baseX + 130, baseY + 41);

                        let x = 0;
                        for await (let [key, value] of Object.entries(event.roster[i].rewards)) {
                            let image;
                            switch (key) {
                                case "money":
                                    image = await loadImage(bot.emojis.cache.get(moneyEmojiID).url);
                                    break;
                                case "fuseTokens":
                                    image = await loadImage(bot.emojis.cache.get(fuseEmojiID).url);
                                    break;
                                case "trophies":
                                    image = await loadImage(bot.emojis.cache.get(trophyEmojiID).url);
                                    break;
                                case "car":
                                    image = await loadImage(bot.emojis.cache.get(glofEmojiID).url);
                                    value = value.carID;
                                    break;
                                case "pack":
                                    image = await loadImage(bot.emojis.cache.get(packEmojiID).url);
                                    break;
                                default:
                                    break;
                            }

                            let { w, h } = adjustSize(image);
                            ctx.drawImage(image, baseX + 676 + ((65 - w) / 2), baseY + 58 + (x * 77) + ((64 - h) / 2), w, h);
                            ctx.fillText(value, baseX + 754, baseY + 103 + (x * 77));
                            x++;
                        }

                        ctx.textAlign = "center";
                        ctx.font = '30px "Roboto Condensed"';
                        let reqString = "";
                        let words = reqDisplay(event.roster[i].reqs).split(" "), line = "", rowY = 0;
                        for (let x = 0; x < words.length; x++) {
                            reqString = line + words[x] + " ";
                            let metrics = ctx.measureText(reqString);
                            if (metrics.width > 234 && x > 0) {
                                ctx.fillText(line, baseX + 533, baseY + 77 + rowY);
                                line = words[x] + " ";
                                rowY += 25;
                            }
                            else {
                                line = reqString;
                            }
                        }
                        ctx.fillText(line, baseX + 533, baseY + 77 + rowY);
                    }

                    function adjustSize(image) {
                        let scale = Math.min(65 / image.width, 64 / image.height);
                        let w = image.width * scale;
                        let h = image.height * scale;
                        return { w, h };
                    }
                }
                catch (error) {
                    console.log(error);
                    attachment = new MessageAttachment(failedToLoadImageLink, "event.png");
                    cucked = true;
                }
                if (!cucked) {
                    attachment = new MessageAttachment(canvas.toBuffer(), "event.png");
                }

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${event.name} event!`,
                    author: message.author,
                });
                await currentEventsChannel.send({
                    content: `**The ${event.name} event has officially started!**`,
                    files: [attachment]
                });

                await eventModel.updateOne({ eventID: event.eventID }, event);
                return successMessage.sendMessage({ attachment, currentMessage });
            }
        }
    }
};