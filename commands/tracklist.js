"use strict";
/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   /
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");
const fs = require("fs");
const trackFiles = fs.readdirSync("./commands/tracks").filter(file => file.endsWith('.json'));
module.exports = {
    name: "tracklist",
    aliases: ["alltracks"],
    usage: "(optional) <page number>",
    args: 0,
    category: "Info",
    description: "Shows all the cars that are available in Cloned Drives in list form.",
    async execute(message, args) {
        const pageLimit = 10;
        const filter = (button) => {
            return button.clicker.user.id === message.author.id;
        };
        const settings = await db.get(`acc${message.author.id}.settings`);
        var trackList = "";
        var reactionIndex = 0;
        var page;
        if (!args.length) {
            page = 1;
        }
        else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        }
        else {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, invalid integer provided.")
                .setDescription("It looks like the page number you requested is not a number.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        const totalTracks = trackFiles.length;
        const totalPages = Math.ceil(totalTracks / pageLimit);
        trackFiles.sort(function (a, b) {
            if (a < b) {
                return -1;
            }
            else if (a > b) {
                return 1;
            }
            else {
                return 0;
            }
        });
        if (page < 0 || totalPages < page) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, page number requested invalid.")
                .setDescription(`The car list ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        trackDisplay(page);
        let firstPage, prevPage, nextPage, lastPage;
        if (settings.buttonstyle === "classic") {
            firstPage = new disbut.MessageButton()
                .setStyle("grey")
                .setEmoji("⏪")
                .setID("first_page");
            prevPage = new disbut.MessageButton()
                .setStyle("grey")
                .setEmoji("⬅️")
                .setID("prev_page");
            nextPage = new disbut.MessageButton()
                .setStyle("grey")
                .setEmoji("➡️")
                .setID("next_page");
            lastPage = new disbut.MessageButton()
                .setStyle("grey")
                .setEmoji("⏩")
                .setID("last_page");
        }
        else {
            firstPage = new disbut.MessageButton()
                .setStyle("red")
                .setLabel("<<")
                .setID("first_page");
            prevPage = new disbut.MessageButton()
                .setStyle("blurple")
                .setLabel("<")
                .setID("prev_page");
            nextPage = new disbut.MessageButton()
                .setStyle("blurple")
                .setLabel(">")
                .setID("next_page");
            lastPage = new disbut.MessageButton()
                .setStyle("red")
                .setLabel(">>")
                .setID("last_page");
        }
        let infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle("List of All Tracks in Cloned Drives")
            .addField("Track", trackList, true)
            .setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
            .setTimestamp();
        switch (reactionIndex) {
            case 0:
                firstPage.setDisabled();
                prevPage.setDisabled();
                nextPage.setDisabled();
                lastPage.setDisabled();
                break;
            case 1:
                firstPage.setDisabled();
                prevPage.setDisabled();
                break;
            case 2:
                nextPage.setDisabled();
                lastPage.setDisabled();
                break;
            case 3:
                break;
            default:
                break;
        }
        let row = new disbut.MessageActionRow().addComponents(firstPage, prevPage, nextPage, lastPage);
        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        await message.channel.send({ embed: infoScreen, component: row }).then(listMessage => {
            const collector = listMessage.createButtonCollector(filter, { time: 60000 });
            collector.on("collect", async (button) => {
                switch (button.id) {
                    case "first_page":
                        page = 1;
                        break;
                    case "prev_page":
                        page -= 1;
                        break;
                    case "next_page":
                        page += 1;
                        break;
                    case "last_page":
                        page = totalPages;
                        break;
                    default:
                        break;
                }
                trackDisplay(page);
                if (settings.buttonstyle === "classic") {
                    firstPage = new disbut.MessageButton()
                        .setStyle("grey")
                        .setEmoji("⏪")
                        .setID("first_page");
                    prevPage = new disbut.MessageButton()
                        .setStyle("grey")
                        .setEmoji("⬅️")
                        .setID("prev_page");
                    nextPage = new disbut.MessageButton()
                        .setStyle("grey")
                        .setEmoji("➡️")
                        .setID("next_page");
                    lastPage = new disbut.MessageButton()
                        .setStyle("grey")
                        .setEmoji("⏩")
                        .setID("last_page");
                }
                else {
                    firstPage = new disbut.MessageButton()
                        .setStyle("red")
                        .setLabel("<<")
                        .setID("first_page");
                    prevPage = new disbut.MessageButton()
                        .setStyle("blurple")
                        .setLabel("<")
                        .setID("prev_page");
                    nextPage = new disbut.MessageButton()
                        .setStyle("blurple")
                        .setLabel(">")
                        .setID("next_page");
                    lastPage = new disbut.MessageButton()
                        .setStyle("red")
                        .setLabel(">>")
                        .setID("last_page");
                }
                let infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("List of All Tracks in Cloned Drives")
                    .addField("Track", trackList, true)
                    .setFooter(`Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`)
                    .setTimestamp();
                switch (reactionIndex) {
                    case 0:
                        firstPage.setDisabled();
                        prevPage.setDisabled();
                        nextPage.setDisabled();
                        lastPage.setDisabled();
                        break;
                    case 1:
                        firstPage.setDisabled();
                        prevPage.setDisabled();
                        break;
                    case 2:
                        nextPage.setDisabled();
                        lastPage.setDisabled();
                        break;
                    case 3:
                        break;
                    default:
                        break;
                }
                row = new disbut.MessageActionRow().addComponents(firstPage, prevPage, nextPage, lastPage);
                await listMessage.edit({ embed: infoScreen, component: row });
                await button.reply.defer();
            });
            collector.on("end", () => {
                listMessage.edit({ embed: infoScreen, component: null });
            });
        });
        function trackDisplay(page) {
            let startsWith, endsWith;
            if (trackFiles.length - pageLimit <= 0) {
                startsWith = 0;
                endsWith = trackFiles.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (trackFiles.length - (pageLimit * page) <= 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = trackFiles.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }
            trackList = "";
            for (i = startsWith; i < endsWith; i++) {
                trackList += `${i + 1 - ((page - 1) * 10)}. `;
                let currentTrack = require(`./tracksets/${trackFiles[i]}`);
                trackList += `${currentTrack["trackName"]} \n`;
            }
        }
    }
};
//# sourceMappingURL=tracklist.js.map