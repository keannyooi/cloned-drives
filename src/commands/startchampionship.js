"use strict";

const bot = require("../config/config.js");
const { AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { registerFont, loadImage, createCanvas } = require("canvas");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime, failedToLoadImageLink, moneyEmojiID, fuseEmojiID, trophyEmojiID, glofEmojiID, packEmojiID } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const profileModel = require("../models/profileSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "startchampionship",
    aliases: ["launchchampionship", "schamp"],
    usage: ["<championship name>"],
    args: 1,
    category: "Admin",
    description: "Starts an inactive championship.",
    async execute(message, args) {
        const championships = await championshipModel.find({ isActive: false });
        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, championships, "championships")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startChampionship(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startChampionship(championship, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${championship.name} championship?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const playerDatum = await profileModel.find({ "settings.sendeventnotifs": true });
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                championship.isActive = true;
                if (championship.deadline.length < 9) {
                    echampionship.deadline = DateTime.now().plus({ days: parseInt(championship.deadline) }).toISO();
                }

                registerFont("RobotoCondensed-Bold.ttf", { family: "Roboto Condensed", weight: "bold" });
                const canvas = createCanvas(903 * Math.ceil(championship.roster.length / 5), 299 * (championship.roster.length <= 5 ? championship.roster.length : 5));
                const ctx = canvas.getContext("2d");
                let attachment, cucked = false;

                try {
                    let hudPromises = await Promise.all(championship.roster.map(car => {
                        let currentCar = require(`../cars/${car.carID}`);
                        return loadImage(currentCar["racehud"]);
                    }));
                    let mapPromises = await Promise.all(championship.roster.map(track => {
                        let currentTrack = require(`../tracks/${track.track}`);
                        return loadImage(currentTrack["map"]);
                    }));
                    let [moneyImage, fuseImage,
                        trophyImage, carImage, packImage] = await Promise.all([
                            loadImage(bot.emojis.cache.get(moneyEmojiID).url),
                            loadImage(bot.emojis.cache.get(fuseEmojiID).url),
                            loadImage(bot.emojis.cache.get(trophyEmojiID).url),
                            loadImage(bot.emojis.cache.get(glofEmojiID).url),
                            loadImage(bot.emojis.cache.get(packEmojiID).url)
                        ]);
                    ctx.fillStyle = "#ffffff";

                    for (let i = 0; i < championship.roster.length; i++) {
                        let baseX = Math.floor(i / 5) * 903;
                        let baseY = (i % 5) * 299;

                        ctx.font = 'bold 41px "Roboto Condensed"';
                        ctx.textAlign = "left";
                        ctx.drawImage(bot.graphics.eventTemp, baseX, baseY);
                        ctx.drawImage(hudPromises[i], baseX + 13, baseY + 59, 374, 224);
                        ctx.drawImage(mapPromises[i], baseX + 482, baseY + 190, 98, 98);
                        ctx.fillText(i + 1, baseX + 130, baseY + 41);
                        ctx.fillText(championship.roster[i].upgrade, baseX + 31, baseY + 277);

                        let x = 0;
                        ctx.font = 'bold 38px "Roboto Condensed"';
                        for await (let [key, value] of Object.entries(championship.roster[i].rewards)) {
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
                                    image = carImage
                                    value = value.carID;
                                    let car = require(`../cars/${value}`);
                                    if (car["cr"] > 849) {
                                        ctx.fillStyle = "#ffb80d";
                                    }
                                    else if (car["cr"] <= 849 && car["cr"] > 699) {
                                        ctx.fillStyle = "#9e3fff";
                                    }
                                    else if (car["cr"] <= 699 && car["cr"] > 549) {
                                        ctx.fillStyle = "#ff3639";
                                    }
                                    else if (car["cr"] <= 549 && car["cr"] > 399) {
                                        ctx.fillStyle = "#ffd737";
                                    }
                                    else if (car["cr"] <= 399 && car["cr"] > 249) {
                                        ctx.fillStyle = "37cdff";
                                    }
                                    else if (car["cr"] <= 249 && car["cr"] > 99) {
                                        ctx.fillStyle = "#78ff53";
                                    }
                                    else {
                                        ctx.fillStyle = "#aaaaaa";
                                    }
                                    break;
                                case "pack":
                                    image = packImage
                                    let pack = require(`../packs/${value}`);
                                    if (pack["packName"].toLowerCase().includes("elite")) {
                                        ctx.fillStyle = "#ff3639";
                                    }
                                    else if (pack["packName"].toLowerCase().includes("booster")) {
                                        ctx.fillStyle = "#78ff53";
                                    }
                                    else {
                                        ctx.fillStyle = "#ffd737";
                                    }
                                    break;
                                default:
                                    break;
                            }

                            let { w, h } = adjustSize(image);
                            ctx.drawImage(image, baseX + 676 + ((65 - w) / 2), baseY + 58 + (x * 77) + ((64 - h) / 2), w, h);
                            ctx.fillText(value, baseX + 754, baseY + 103 + (x * 77));
                            ctx.fillStyle = "#ffffff";
                            x++;
                        }

                        ctx.textAlign = "center";
                        ctx.font = 'bold 30px "Roboto Condensed"';
                        let reqString = "";
                        let words = reqDisplay(championship.roster[i].reqs).split(" "), line = "", rowY = 0;
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
                    attachment = new AttachmentBuilder(failedToLoadImageLink, { name: "championship.jpg" });
                    cucked = true;
                }
                if (!cucked) {
                    attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "championship.jpg" });
                }

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${championship.name} championship!`,
                    author: message.author,
                });
                await currentEventsChannel.send({
                    content: `**The ${championship.name} championship has officially started!**`,
                    files: [attachment]
                });

                for (let { userID } of playerDatum) {
                    let user = await bot.homeGuild.members.fetch(userID)
                        .catch(() => "unable to find user, next");
                    
                    if (typeof user !== "string") {
                        await user.send(`**Notification: The ${championship.name} championship has officially started!**`)
				            .catch(() => console.log(`unable to send notification to user ${userID}`));
                    }
                }
                await championshipModel.updateOne({ championshipID: championship.championshipID }, championship);
                return successMessage.sendMessage({ attachment, currentMessage });
            }
        }
    }
};