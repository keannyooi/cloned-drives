"use strict";

const { searchUser } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");
const { InfoMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const bot = require("../config.js");

module.exports = {
    name: "statistics",
    aliases: ["stats"],
    usage: "(optional) <username>",
    args: 0,
    category: "Info",
    description: "Shows someone's stats.",
    async execute(message, args) {
        if (args.length) {
            if (message.mentions.users.first()) {
                if (!message.mentions.users.first().bot) {
                    displayData(message.mentions.users.first());
                }
                else {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, user requested is a bot.",
                        desc: "Bots can't play Cloned Drives.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
            }
            else {
                const userSaves = await profileModel.find({});
                const availableUsers = await message.guild.members.fetch();
                availableUsers.filter(user => userSaves.find(f => f.userID = user.id));
                new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase(), availableUsers)))
                    .then(async (hmm) => {
                        if (!Array.isArray(hmm)) return;
                        let [result, currentMessage] = hmm;
                        await displayData(result.user, currentMessage);
                    });
            }
        }
        else {
            await displayData(message.author);
        }

        async function displayData(user, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get("726017235826770021");
            const fuseEmoji = bot.emojis.cache.get("726018658635218955");
            const trophyEmoji = bot.emojis.cache.get("775636479145148418");

            const playerData = await profileModel.findOne({ userID: user.id });
            console.log(playerData);
            let totalCars = 0, maxedCars = 0;
            playerData.garage.forEach(car => {
                maxedCars += (car.upgrades["996"] + car.upgrades["969"] + car.upgrades["699"]);
                totalCars += (car.upgrades["000"] + car.upgrades["333"] + car.upgrades["666"] + maxedCars);
            });

            const MCpercentage = maxedCars / totalCars * 100;
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Stats of ${user.tag}`,
                desc: `Account created on <t:${Math.round(user.createdAt.getTime() / 1000)}>`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [
                    { name: "Money Balance", value: `${moneyEmoji}${playerData.money.toString() ?? 0}`, inline: true },
                    { name: "Fuse Tokens", value: `${fuseEmoji}${playerData.fuseTokens.toString() ?? 0}`, inline: true },
                    { name: "Trophies", value: `${trophyEmoji}${playerData.trophies.toString() ?? 0}`, inline: true },
                    { name: "Total Cars in Garage", value: totalCars.toString(), inline: true },
                    { name: "Total Maxed Cars in Garage", value: maxedCars.toString(), inline: true },
                    { name: "Maxed Car Percentage", value: `${MCpercentage.toFixed(2)}%`, inline: true }
                ]
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};