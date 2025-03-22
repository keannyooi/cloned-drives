"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, sandboxRoleID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const createCar = require("../util/functions/createCar.js");
const confirm = require("../util/functions/confirm.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const race = require("../util/functions/race.js");
const search = require("../util/functions/search.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const profileModel = require("../models/profileSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "playchampionship",
    aliases: ["pc"],
    usage: "<championship name>",
    args: 1,
    category: "Gameplay",
    cooldown: 10,
    description: "Participates in an championship by doing a race.",
    async execute(message, args) {
        //if (message.channel.type !== 1) {
            //const errorMessage = new ErrorMessage({
                //channel: message.channel,
                //title: "Sorry, this command can only be used in DMs.",
               // desc: "This is to avoid people from leaking championship solutions and, as a result, making championships trivial.",
                //author: message.author
            //});
           // return errorMessage.sendMessage();
       // } - Play DM Only

        const championships = await championshipModel.find();
        const { hand, unclaimedRewards, settings } = await profileModel.findOne({ userID: message.author.id });
        if (hand.carID === "") {
            return handMissingError(message);
        }

        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, championships, "championships")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await playChampionship(...response);
            })
            .catch(error => {
                throw error;
            });

        async function playChampionship(championship, currentMessage) {
            // console.log(championship);
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            let round = championship.playerProgress[message.author.id] ?? 1;
            if (round > championship.roster.length) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "You have already completed this championship.",
                    desc: "Try out the other championships, if available.",
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }
			else if (guildMember.roles.cache.has(sandboxRoleID)) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this is not available for Sandbox Alts.",
                    desc: `Unfortunately the commnad you are trying to use is not a available for accounts with the <@&${sandboxRoleID}> role.`,
                    author: message.author,
                });
                return errorMessage.sendMessage();
            }

            if (!filterCheck({ car: hand, filter: championship.roster[round - 1].reqs, applyOrLogic: true })) {
                let currentCar = require(`../cars/${hand.carID}`);
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like your hand does not meet the championship round's requirements.",
                    desc: `**Round ${round} (Reqs: \`${reqDisplay(championship.roster[round - 1].reqs)}\`)**
					**Current Hand:** ${carNameGen({ currentCar, rarity: true, upgrade: hand.upgrade })}`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            if (championship.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
                const track = require(`../tracks/${championship.roster[round - 1].track}.json`);
                const [playerCar, playerList] = createCar(hand, settings.unitpreference, settings.hideownstats);
                const [opponentCar, opponentList] = createCar(championship.roster[round - 1], settings.unitpreference);

                const intermission = new InfoMessage({
                    channel: message.channel,
                    title: "Ready to Play?",
                    desc: `Track: ${track["trackName"]}, Requirements: \`${reqDisplay(championship.roster[round - 1].reqs, settings.filterlogic)}\``,
                    author: message.author,
                    thumbnail: track["map"],
                    fields: [
                        { name: "Your Hand", value: playerList, inline: true },
                        { name: "Opponent's Hand", value: opponentList, inline: true }
                    ],
                    footer: `Championship: ${championship.name} (Round ${round})`
                });
                await confirm(message, intermission, acceptedFunction, settings.buttonstyle, currentMessage);

                async function acceptedFunction(currentMessage) {
                    if (championship.isActive && championship.deadline !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(championship.deadline)).invalid !== null) {
                        intermission.editEmbed({ title: "Looks like this championship just ended.", desc: "That's just sad." });
                        return intermission.sendMessage({ currentMessage });
                    }
                    currentMessage.removeButtons();
                    const result = await race(message, playerCar, opponentCar, track, settings.enablegraphics);

                    if (result > 0) {
                        for (let [key, value] of Object.entries(championship.roster[round - 1].rewards)) {
                            switch (key) {
                                case "money":
                                case "fuseTokens":
                                case "trophies":
                                    let hasEntry = unclaimedRewards.findIndex(entry => entry.origin === championship.name && entry[key] !== undefined);
                                    if (hasEntry > -1) {
                                        unclaimedRewards[hasEntry][key] += value;
                                    }
                                    else {
                                        let template = {};
                                        template[key] = value;
                                        template.origin = championship.name;
                                        unclaimedRewards.push(template);
                                    }
                                    break;
                                case "car":
                                    unclaimedRewards.push({
                                        car: {
                                            carID: value.carID.slice(0, 6),
                                            upgrade: value.upgrade
                                        },
                                        origin: championship.name
                                    });
                                    break;
                                case "pack":
                                    unclaimedRewards.push({
                                        pack: value.slice(0, 6),
                                        origin: championship.name
                                    });
                                    break;
                                default:
                                    break;
                            }
                        }

                        message.channel.send(`**You have beaten Round ${round}! Claim your reward using \`cd-rewards\`.**`);
                        const set = {};
                        set[`playerProgress.${message.author.id}`] = round + 1;
                        await Promise.all([
                            championshipModel.updateOne({ championshipID: championship.championshipID }, { "$set": set }),
                            profileModel.updateOne({ userID: message.author.id }, { unclaimedRewards })
                        ]);
                    }
                    return bot.deleteID(message.author.id);
                }
            }
            else {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, you may not play this championship yet.",
                    desc: `The championship you are trying to view is not active currently. You may only view this championship if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author,
                });
                return message.channel.send(errorMessage);
            }
        }
    }
};