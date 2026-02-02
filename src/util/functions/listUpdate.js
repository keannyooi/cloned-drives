"use strict";

const { ActionRowBuilder, ButtonBuilder, ComponentType: { Button } } = require("discord.js");
const { defaultPageLimit, defaultWaitTime } = require("../consts/consts.js");
const getButtons = require("./getButtons.js");
const paginate = require("./paginate.js")

async function listUpdate(list, page, totalPages, listDisplay, settings, currentMessage) {
    const pageLimit = settings.listamount || defaultPageLimit;
    const filter = button => button.user.id === embed.authorID;
    let section = paginate(list, page, settings.listamount);
    let { firstPage, prevPage, nextPage, lastPage } = getButtons("menu", settings.buttonstyle);
    let embed = listDisplay(section, page, totalPages);

    if (list.length <= pageLimit) {
        firstPage = ButtonBuilder.from(firstPage).setDisabled(true);
        prevPage = ButtonBuilder.from(prevPage).setDisabled(true);
        nextPage = ButtonBuilder.from(nextPage).setDisabled(true);
        lastPage = ButtonBuilder.from(lastPage).setDisabled(true);
    }
    else if (list.length <= page * pageLimit) {
        firstPage = ButtonBuilder.from(firstPage).setDisabled(false);
        prevPage = ButtonBuilder.from(prevPage).setDisabled(false);
        nextPage = ButtonBuilder.from(nextPage).setDisabled(true);
        lastPage = ButtonBuilder.from(lastPage).setDisabled(true);
    }
    else if (page === 1) {
        firstPage = ButtonBuilder.from(firstPage).setDisabled(true);
        prevPage = ButtonBuilder.from(prevPage).setDisabled(true);
        nextPage = ButtonBuilder.from(nextPage).setDisabled(false);
        lastPage = ButtonBuilder.from(lastPage).setDisabled(false);
    }
    else {
        firstPage = ButtonBuilder.from(firstPage).setDisabled(false);
        prevPage = ButtonBuilder.from(prevPage).setDisabled(false);
        nextPage = ButtonBuilder.from(nextPage).setDisabled(false);
        lastPage = ButtonBuilder.from(lastPage).setDisabled(false);
    }

    let row = new ActionRowBuilder().addComponents(firstPage, prevPage, nextPage, lastPage);
    let listMessage = await embed.sendMessage({ buttons: [row], currentMessage });

    const collector = listMessage.message.createMessageComponentCollector({ filter, time: defaultWaitTime, componentType: Button });
    collector.on("collect", async (button) => {
        try {
            await button.deferUpdate();
            switch (button.customId) {
                case "firstPage":
                    page = 1;
                    break;
                case "prevPage":
                    page -= 1;
                    break;
                case "nextPage":
                    page += 1;
                    break;
                case "lastPage":
                    page = totalPages;
                    break;
                default:
                    break;
            }
    
            section = paginate(list, page, settings.listamount);
            if (list.length <= pageLimit) {
                firstPage = ButtonBuilder.from(firstPage).setDisabled(true);
                prevPage = ButtonBuilder.from(prevPage).setDisabled(true);
                nextPage = ButtonBuilder.from(nextPage).setDisabled(true);
                lastPage = ButtonBuilder.from(lastPage).setDisabled(true);
            }
            else if (list.length <= page * pageLimit) {
                firstPage = ButtonBuilder.from(firstPage).setDisabled(false);
                prevPage = ButtonBuilder.from(prevPage).setDisabled(false);
                nextPage = ButtonBuilder.from(nextPage).setDisabled(true);
                lastPage = ButtonBuilder.from(lastPage).setDisabled(true);
            }
            else if (page === 1) {
                firstPage = ButtonBuilder.from(firstPage).setDisabled(true);
                prevPage = ButtonBuilder.from(prevPage).setDisabled(true);
                nextPage = ButtonBuilder.from(nextPage).setDisabled(false);
                lastPage = ButtonBuilder.from(lastPage).setDisabled(false);
            }
            else {
                firstPage = ButtonBuilder.from(firstPage).setDisabled(false);
                prevPage = ButtonBuilder.from(prevPage).setDisabled(false);
                nextPage = ButtonBuilder.from(nextPage).setDisabled(false);
                lastPage = ButtonBuilder.from(lastPage).setDisabled(false);
            }
    
            row = new ActionRowBuilder().addComponents(firstPage, prevPage, nextPage, lastPage);
            embed = listDisplay(section, page, totalPages, currentMessage);
            listMessage = await embed.sendMessage({ buttons: [row], currentMessage: listMessage });
        }
        catch (error) {
            console.log(error);
        }
    });
    collector.on("end", () => {
        return listMessage.removeButtons();
    });
}

module.exports = listUpdate;
