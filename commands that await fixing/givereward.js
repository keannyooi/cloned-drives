"use strict";

const { readdirSync } = require("fs");
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const searchUser = require("../util/functions/searchUser.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "givereward",
    usage: ["<username> <pack or offer> <pack/offer name>"],
    args: 3,
    category: "Admin",
    description: "Gifts someone a pack or offer. Those who are given a pack/offer via this command can claim them through cd-rewards.",
    execute(message, args) {
        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                await addStuff(message.mentions.users.first());
            }
            else {
                return botUserError(message);
            }
        }
        else {
            await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await addStuff(result.user, currentMessage);
                })
                .catch(error => {
                    throw error;
                });
        }

        async function addStuff(user, currentMessage) {
            const { unclaimedRewards } = await profileModel.findOne({ userID: user.id });
            let successMessage;
            switch (args[1].toLowerCase()) {
                case "pack":
                    let query = args.slice(2, args.length).map(i => i.toLowerCase());
                    await new Promise(resolve => resolve(search(message, query, packFiles, searchBy)))
                        .then(response => {
                            if (!Array.isArray(response)) return;
                            let [pack] = response;
                            unclaimedRewards.push({ pack, origin: message.author.username });
                            let currentPack = require(`./packs/${pack}`);
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully gifted 1 ${currentPack["packName"]} to ${user.username}!`,
                                author: message.author,
                                image: currentPack["pack"]
                            });
                        })
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "offer":
                    const offers = await db.get("limitedOffers");
                    let offerName = args.slice(2, args.length).map(i => i.toLowerCase());
                    let searchResults1 = offers.filter(function (offer) {
                        return offerName.every(part => offer.name.toLowerCase().includes(part));
                    });
                    let giveOffer;
                    if (searchResults1.length > 1) {
                        let offerList = "";
                        for (i = 1; i <= searchResults1.length; i++) {
                            offerList += `${i} - ${searchResults1[i - 1].name}\n`;
                        }
                        const successMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Multiple offers found, please type one of the following.")
                            .setDescription(offerList)
                            .setTimestamp();
                        await message.channel.send(successMessage).then(async (currentMessage) => {
                            await message.channel.awaitMessages(filter, {
                                max: 1,
                                time: 60000,
                                errors: ["time"]
                            })
                                .then(collected => {
                                    collected.first().delete();
                                    if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults1.length || parseInt(collected.first().content) < 1) {
                                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                        const errorMessage = new Discord.MessageEmbed()
                                            .setColor("#fc0303")
                                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                            .setTitle("Error, invalid integer provided.")
                                            .setDescription("It looks like your response was either not a number or not part of the selection.")
                                            .setTimestamp();
                                        return currentMessage.edit(errorMessage);
                                    }
                                    else {
                                        giveOffer = searchResults1[parseInt(collected.first().content) - 1];
                                    }
                                })
                                .catch(() => {
                                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                    const cancelMessage = new Discord.MessageEmbed()
                                        .setColor("#34aeeb")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                        .setTitle("Action cancelled automatically.")
                                        .setTimestamp();
                                    return currentMessage.edit(cancelMessage);
                                });
                        });
                    }
                    else if (searchResults1.length > 0) {
                        giveOffer = searchResults1[0];
                    }
                    else {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, offer requested not found.")
                            .setDescription("Well that sucks.")
                            .addField("Keywords Received", `\`${offerName.join(" ")}\``)
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    for (let [key, value] of Object.entries(giveOffer.offer)) {
                        switch (key) {
                            case "money":
                            case "fuseTokens":
                            case "trophies":
                                unclaimedRewards[key] += value;
                                break;
                            case "car":
                                let isInRewards = unclaimedRewards.cars.findIndex(car => {
                                    return car.carFile === value;
                                });
                                if (isInRewards !== -1) {
                                    unclaimedRewards.cars[isInRewards].amount++;
                                }
                                else {
                                    unclaimedRewards.cars.push({
                                        carFile: value,
                                        amount: 1
                                    });
                                }
                                ;
                                break;
                            case "pack":
                                unclaimedRewards.packs.push(value);
                                break;
                            default:
                                break;
                        }
                    }

                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully gifted 1 ${giveOffer.name} to ${user.username}!`,
                        author: message.author,
                    });
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: `Error, I don't know the kind of thing you want to gift to ${user.username}.`,
                        desc: "FYI, ou can either gift a `pack` or an `offer`.",
                        author: message.author,
                        image: currentPack["pack"]
                    }).displayClosest(args[1].toLowerCase());
                    await errorMessage.sendMessage({ currentMessage });
            }

            await profileModel.updateOne({ userID: message.author.id }, { unclaimedRewards });
            return successMessage.sendMessage({ currentMessage })
        }
    }
};