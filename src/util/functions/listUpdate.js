"use strict";

const { ActionRowBuilder, ButtonBuilder, ComponentType: { Button } } = require("discord.js");
const { defaultPageLimit, defaultWaitTime } = require("../consts/consts.js");
const getButtons = require("./getButtons.js");
const paginate = require("./paginate.js")

// L-04: Extracted duplicated button state logic into a helper function
function updateButtonStates(list, page, pageLimit, firstPage, prevPage, nextPage, lastPage) {
    const atStart = page === 1;
    const atEnd = list.length <= page * pageLimit;
    const singlePage = list.length <= pageLimit;

    firstPage = ButtonBuilder.from(firstPage).setDisabled(singlePage || atStart);
    prevPage = ButtonBuilder.from(prevPage).setDisabled(singlePage || atStart);
    nextPage = ButtonBuilder.from(nextPage).setDisabled(singlePage || atEnd);
    lastPage = ButtonBuilder.from(lastPage).setDisabled(singlePage || atEnd);

    return { firstPage, prevPage, nextPage, lastPage };
}

async function listUpdate(list, page, totalPages, listDisplay, settings, currentMessage) {
    const pageLimit = settings.listamount || defaultPageLimit;
    const filter = button => button.user.id === embed.authorID;
    let section = paginate(list, page, settings.listamount);
    let { firstPage, prevPage, nextPage, lastPage } = getButtons("menu", settings.buttonstyle);
    let embed = listDisplay(section, page, totalPages);

    ({ firstPage, prevPage, nextPage, lastPage } = updateButtonStates(list, page, pageLimit, firstPage, prevPage, nextPage, lastPage));

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
            ({ firstPage, prevPage, nextPage, lastPage } = updateButtonStates(list, page, pageLimit, firstPage, prevPage, nextPage, lastPage));

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
