"use strict";

const fs = require("fs");
const path = require("path");

const bot = require("../config/config.js");
const { AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { loadImage, createCanvas } = require("@napi-rs/canvas");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime, failedToLoadImageLink, moneyEmojiID, fuseEmojiID, trophyEmojiID, glofEmojiID, packEmojiID } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

// 🔧 Manual dev switch to disable DMs
const DEV_MODE = false;

// 🔄 Loader to read all files in a folder and build a lookup object
function loadFolder(folderPath) {
    const data = {};
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
        if (file.endsWith(".js") || file.endsWith(".json")) {
            const key = path.basename(file, path.extname(file)); // filename without extension
            data[key] = require(path.join(folderPath, file));
        }
    }
    return data;
}

// 📂 Preload cars, tracks, packs
const cars = loadFolder(path.join(__dirname, "../cars"));
const tracks = loadFolder(path.join(__dirname, "../tracks"));
const packs = loadFolder(path.join(__dirname, "../packs"));

module.exports = {
    name: "startevent",
    aliases: ["launchevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive event.",
    async execute(message, args) {
        const events = await eventModel.find({ isActive: false });
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
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${event.name} event?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const playerDatum = await profileModel.find({ "settings.sendeventnotifs": true });
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                event.isActive = true;

                if (event.deadline.length < 9) {
                    event.deadline = DateTime.now().plus({ days: parseInt(event.deadline) }).toISO();
                }

                const canvas = createCanvas(903 * Math.ceil(event.roster.length / 5), 299 * (event.roster.length <= 5 ? event.roster.length : 5));
                const context = canvas.getContext("2d");
                let attachment, cucked = false;

                try {
                    let hudPromises = await Promise.all(event.roster.map(car => {
                        let currentCar = cars[car.carID];
                        return loadImage(currentCar["racehud"]);
                    }));
                    let mapPromises = await Promise.all(event.roster.map(track => {
                        let currentTrack = tracks[track.track];
                        return loadImage(currentTrack["map"]);
                    }));
                    let [moneyImage, fuseImage, trophyImage, carImage, packImage] = await Promise.all([
                        loadImage(bot.emojis.cache.get(moneyEmojiID).url),
                        loadImage(bot.emojis.cache.get(fuseEmojiID).url),
                        loadImage(bot.emojis.cache.get(trophyEmojiID).url),
                        loadImage(bot.emojis.cache.get(glofEmojiID).url),
                        loadImage(bot.emojis.cache.get(packEmojiID).url)
                    ]);

                    context.fillStyle = "#ffffff";

                    for (let i = 0; i < event.roster.length; i++) {
                        let baseX = Math.floor(i / 5) * 903;
                        let baseY = (i % 5) * 299;

                        context.font = 'bold 41px "Roboto Condensed"';
                        context.textAlign = "left";
                        context.drawImage(bot.graphics.eventTemp, baseX, baseY);
                        context.drawImage(hudPromises[i], baseX + 13, baseY + 59, 374, 224);
                        context.drawImage(mapPromises[i], baseX + 482, baseY + 190, 98, 98);
                        context.fillText(i + 1, baseX + 130, baseY + 41);
                        context.fillText(event.roster[i].upgrade, baseX + 31, baseY + 277);

                        let x = 0;
                        context.font = 'bold 38px "Roboto Condensed"';
                        for (let [key, value] of Object.entries(event.roster[i].rewards)) {
                            let image;
                            switch (key) {
                                case "money":
                                    image = moneyImage;
                                    value = value.toLocaleString("en");
                                    break;
                                case "fuseTokens":
                                    image = fuseImage;
                                    value = value.toLocaleString("en");
                                    break;
                                case "trophies":
                                    image = trophyImage;
                                    value = value.toLocaleString("en");
                                    break;
                                case "car":
                                    image = carImage;
                                    value = value.carID;
                                    let car = cars[value];
                                    if (car["cr"] > 849) context.fillStyle = "#ffb80d";
                                    else if (car["cr"] > 699) context.fillStyle = "#9e3fff";
                                    else if (car["cr"] > 549) context.fillStyle = "#ff3639";
                                    else if (car["cr"] > 399) context.fillStyle = "#ffd737";
                                    else if (car["cr"] > 249) context.fillStyle = "#37cdff";
                                    else if (car["cr"] > 99) context.fillStyle = "#78ff53";
                                    else context.fillStyle = "#aaaaaa";
                                    break;
                                case "pack":
                                    image = packImage;
                                    let pack = packs[value];
                                    if (pack["packName"].toLowerCase().includes("elite")) {
                                        context.fillStyle = "#ff3639";
                                    } else if (pack["packName"].toLowerCase().includes("booster")) {
                                        context.fillStyle = "#78ff53";
                                    } else {
                                        context.fillStyle = "#ffd737";
                                    }
                                    break;
                                default:
                                    break;
                            }

                            let { w, h } = adjustSize(image);
                            context.drawImage(image, baseX + 676 + ((65 - w) / 2), baseY + 58 + (x * 77) + ((64 - h) / 2), w, h);
                            context.fillText(value, baseX + 754, baseY + 103 + (x * 77));
                            context.fillStyle = "#ffffff";
                            x++;
                        }

                        context.textAlign = "center";
                        context.font = 'bold 30px "Roboto Condensed"';
                        let reqString = "";
                        let words = reqDisplay(event.roster[i].reqs).split(" "), line = "", rowY = 0;
                        for (let x = 0; x < words.length; x++) {
                            reqString = line + words[x] + " ";
                            let metrics = context.measureText(reqString);
                            if (metrics.width > 234 && x > 0) {
                                context.fillText(line, baseX + 533, baseY + 77 + rowY);
                                line = words[x] + " ";
                                rowY += 25;
                            } else {
                                line = reqString;
                            }
                        }
                        context.fillText(line, baseX + 533, baseY + 77 + rowY);
                    }

                    function adjustSize(image) {
                        let scale = Math.min(65 / image.width, 64 / image.height);
                        let w = image.width * scale;
                        let h = image.height * scale;
                        return { w, h };
                    }
                } catch (error) {
                    console.log(error);
                    attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "event.jpeg" });
                    cucked = true;
                }

                if (!cucked) {
                    attachment = new AttachmentBuilder(await canvas.encode("jpeg"), { name: "event.jpeg" });
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

                // 🔕 Respect DEV_MODE to prevent mass DMs
                if (!DEV_MODE) {
                    for (let { userID } of playerDatum) {
                        let user = await bot.homeGuild.members.fetch(userID).catch(() => "unable to find user, next");
                        if (typeof user !== "string") {
                            await user.send(`**Notification: The ${event.name} event has officially started!**`)
                                .catch(() => console.log(`unable to send notification to user ${userID}`));
                        }
                    }
                } else {
                    console.log(`[DEV_MODE] Skipping DM notifications for ${playerDatum.length} players.`);
                }

                await eventModel.updateOne({ eventID: event.eventID }, event);
                return successMessage.sendMessage({ attachment, currentMessage });
            }
        }
    }
};
