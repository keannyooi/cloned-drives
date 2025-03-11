"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { eventMakerRoleID, defaultPageLimit } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listUpdate = require("../util/functions/listUpdate.js");
const listRewards = require("../util/functions/listRewards.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "championships",
    aliases: ["c", "champ", "campaignlist", "storylist"],
    usage: ["[championship name]", "[championship name] [page number]"],
    args: 0,
    category: "Gameplay",
    description: "Views all active and inactive championships.",
    async execute(message, args) {
        const championships = await championshipModel.find();
        if (!args.length || championships.length === 0) {
            let activeChampionships = championships.filter(champ => champ.isActive === true);
            let inactiveChampionships = championships.filter(champ => champ.isActive === false);
            let activeChampionshipList = championshipDisplay(activeChampionships);
            let inactiveChampionshipList = championshipDisplay(inactiveChampionships);
            let listMessage = new InfoMessage({
                channel: message.channel,
                title: "Cloned Drives Championships",
                author: message.author,
                fields: [
                    { name: "Active Championships", value: activeChampionshipList },
                    { name: "Inactive Championships", value: inactiveChampionshipList }
                ],
                footer: "More info about a championship can be found by using cd-championships <championship name>."
            });
            return listMessage.sendMessage();
        }
        else {
            let page = 1;
            if (args.length > 1 && !isNaN(args[args.length - 1])) {
                page = parseInt(args.pop());
            }
           let query = args.map(i => i.toLowerCase());

    //console.log(championships); // Add this line to output the championships array

           await new Promise(resolve => resolve(search(message, query, championships, "championships")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    let [result, currentMessage] = response;
                    await viewChampionship(result, page, currentMessage);
               })
               .catch(error => {
                    throw error;
                });
        }

        async function viewChampionship(championship, page, currentMessage) {
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            console.log(championship);

            if (championship.isActive || guildMember.roles.cache.has(eventMakerRoleID)) {
               const { settings } = await profileModel.findOne({ userID: message.author.id });
               let list = championship.roster;
                const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
                if (page < 1 || totalPages < page) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, page number requested invalid.",
                        desc: `The championship view ends at page ${totalPages}.`,
                        author: message.author
                    }).displayClosest(page);
                    return errorMessage.sendMessage({ currentMessage });
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
                        let round = (page - 1) * (settings.listamount || defaultPageLimit) + i + 1;
                     let currentCar = require(`../cars/${section[i].carID}`);
                        let track = require(`../tracks/${section[i].track}`);

                        fields.push({
                            name: `Round ${round} ${round < championship.playerProgress[message.author.id] ? "✅" : ""}`,
                            value: `Car: ${carNameGen({ currentCar, rarity: true, upgrade: section[i].upgrade })}
                            Track: ${track["trackName"]}
                            Reqs: \`${reqDisplay(section[i].reqs, settings.filterlogic)}\`
                           Reward: ${listRewards(section[i].rewards)}`,
                            inline: true
                        });
                    }

                   const infoMessage = new InfoMessage({
                       channel: message.channel,
                       title: `${championship.name} \`(ID: ${championship.championshipID})\``,
                        desc: `**This championship is ${championship.isActive ? "active!" : "not active."}**
                        Time Remaining: \`${championship.deadline && championship.deadline.length > 9 ? timeDisplay(Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(championship.deadline))) : championship.deadline}\``,
                        author: message.author,
                        fields,
                        footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                    });
                    return infoMessage;
                }
            }
            else {
               const errorMessage = new ErrorMessage({
                   channel: message.channel,
                    title: "Error, you do not have the necessary role to view this championship right now.",
                    desc: `The championship you are trying to view is not active currently. You may only view this championship if you're an <@&${eventMakerRoleID}>.`,
                    author: message.author,
               });
                return errorMessage.sendMessage({ currentMessage });
           }
        }

        function championshipDisplay(championships) {
            if (championships.length > 0) {
                let championshipList = "";
                for (let championship of championships) {
                    let intervalString = "";
                    let progress = championship.playerProgress[message.author.id] ?? 1;
                    if (championship.isActive && championship.deadline !== "unlimited") {
                        let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(championship.deadline));
                        if (interval.invalid === null) {
                            intervalString = `${timeDisplay(interval)} ${progress > championship.roster.length ? "✅" : ""}`;
                        }
                        else {
                            intervalString = `\`currently ending, no longer playable\` ${progress > championship.roster.length ? "✅" : ""}`;
                        }
                   }
                    else if (championship.isActive) {
                       intervalString = `\`.\` ${progress > championship.roster.length ? "✅" : ""}`;
                   }
                    championshipList += `${championship.name} ${intervalString}\n`;
                }
                return championshipList;
            }
            else {
               return "There are currently no championships under this category.\n";
            }
        }
    }
};