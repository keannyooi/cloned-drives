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

// 📂 Load data ON DEMAND instead of preloading everything
function loadFile(folderName, fileName) {
    const filePath = path.join(__dirname, `../${folderName}/${fileName}.json`);
    // Clear cache to ensure fresh data
    delete require.cache[require.resolve(filePath)];
    return require(filePath);
}

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
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                event.isActive = true;

                if (event.deadline.length < 9) {
                    event.deadline = DateTime.now().plus({ days: parseInt(event.deadline) }).toISO();
                }

                const canvas = createCanvas(903 * Math.ceil(event.roster.length / 5), 299 * (event.roster.length <= 5 ? event.roster.length : 5));
                const context = canvas.getContext("2d");
                let attachment, cucked = false;

                try {
                    // 🔄 Load images in batches to reduce memory spike
                    const batchSize = 5;
                    let hudImages = [];
                    let mapImages = [];
                    
                    for (let i = 0; i < event.roster.length; i += batchSize) {
                        const batch = event.roster.slice(i, i + batchSize);
                        
                        const hudBatch = await Promise.all(batch.map(item => {
                            const car = loadFile("cars", item.carID);
                            return loadImage(car.racehud);
                        }));
                        
                        const mapBatch = await Promise.all(batch.map(item => {
                            const track = loadFile("tracks", item.track);
                            return loadImage(track.map);
                        }));
                        
                        hudImages.push(...hudBatch);
                        mapImages.push(...mapBatch);
                    }

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
                        context.drawImage(hudImages[i], baseX + 13, baseY + 59, 374, 224);
                        context.drawImage(mapImages[i], baseX + 482, baseY + 190, 98, 98);
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
                                    let car = loadFile("cars", value);
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
                                    let pack = loadFile("packs", value);
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

                await eventModel.updateOne({ eventID: event.eventID }, event);
                
                // ✅ Send success message IMMEDIATELY
                await successMessage.sendMessage({ attachment, currentMessage });

                // 🔕 Send DM notifications in background (non-blocking)
                if (!DEV_MODE) {
                    sendNotifications(event.name).catch(err => {
                        console.error('[EVENT DMs] Error sending notifications:', err);
                    });
                } else {
                    profileModel.countDocuments({ "settings.sendeventnotifs": true })
                        .then(count => console.log(`[DEV_MODE] Skipping DM notifications for ${count} players.`));
                }
                
                // Background notification function
                async function sendNotifications(eventName) {
                    const BATCH_SIZE = 50;
                    let processedCount = 0;
                    const startTime = Date.now();
                    
                    console.log(`[EVENT DMs] Starting background notifications for "${eventName}"...`);
                    
                    const cursor = profileModel.find({ "settings.sendeventnotifs": true }).cursor();
                    
                    let batch = [];
                    for await (const profile of cursor) {
                        batch.push(profile);
                        
                        if (batch.length >= BATCH_SIZE) {
                            await processBatch(batch, eventName);
                            batch = [];
                            processedCount += BATCH_SIZE;
                            console.log(`[EVENT DMs] Processed ${processedCount} notifications...`);
                        }
                    }
                    
                    // Process remaining users
                    if (batch.length > 0) {
                        await processBatch(batch, eventName);
                        processedCount += batch.length;
                    }
                    
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`[EVENT DMs] Completed ${processedCount} notifications in ${elapsed}s.`);
                    
                    async function processBatch(userBatch, eventName) {
                        await Promise.all(userBatch.map(async ({ userID }) => {
                            try {
                                const user = await bot.homeGuild.members.fetch(userID);
                                await user.send(`**Notification: The ${eventName} event has officially started!**`);
                            } catch (err) {
                                console.log(`Unable to send notification to user ${userID}`);
                            }
                        }));
                    }
                }
            }
        }
    }
};