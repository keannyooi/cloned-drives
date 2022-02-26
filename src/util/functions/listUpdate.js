"use strict";

const { MessageActionRow } = require("discord.js");
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
        firstPage.setDisabled(true);
        prevPage.setDisabled(true);
        nextPage.setDisabled(true);
        lastPage.setDisabled(true);
    }
    else if (list.length <= page * pageLimit) {
        firstPage.setDisabled(false);
        prevPage.setDisabled(false);
        nextPage.setDisabled(true);
        lastPage.setDisabled(true);
    }
    else if (page === 1) {
        firstPage.setDisabled(true);
        prevPage.setDisabled(true);
        nextPage.setDisabled(false);
        lastPage.setDisabled(false);
    }
    else {
        firstPage.setDisabled(false);
        prevPage.setDisabled(false);
        nextPage.setDisabled(false);
        lastPage.setDisabled(false);
    }

    let row = new MessageActionRow({ components: [firstPage, prevPage, nextPage, lastPage] });
    let listMessage = await embed.sendMessage({ buttons: [row], currentMessage });

    const collector = listMessage.message.createMessageComponentCollector({ filter, time: defaultWaitTime });
    collector.on("collect", async (button) => {
        try {
            switch (button.customId) {
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
    
            section = paginate(list, page, settings.listamount);
            if (list.length <= pageLimit) {
                firstPage.setDisabled(true);
                prevPage.setDisabled(true);
                nextPage.setDisabled(true);
                lastPage.setDisabled(true);
            }
            else if (list.length <= page * pageLimit) {
                firstPage.setDisabled(false);
                prevPage.setDisabled(false);
                nextPage.setDisabled(true);
                lastPage.setDisabled(true);
            }
            else if (page === 1) {
                firstPage.setDisabled(true);
                prevPage.setDisabled(true);
                nextPage.setDisabled(false);
                lastPage.setDisabled(false);
            }
            else {
                firstPage.setDisabled(false);
                prevPage.setDisabled(false);
                nextPage.setDisabled(false);
                lastPage.setDisabled(false);
            }
    
            row = new MessageActionRow({ components: [firstPage, prevPage, nextPage, lastPage] });
            embed = listDisplay(section, page, totalPages, currentMessage);
            listMessage = await embed.sendMessage({ buttons: [row], currentMessage: listMessage });
            await button.deferUpdate();
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