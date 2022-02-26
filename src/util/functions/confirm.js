"use strict";

const { MessageActionRow } = require("discord.js");
const { defaultChoiceTime } = require("../consts/consts.js");
const getButtons = require("./getButtons.js");

async function confirm(message, confirmationMessage, acceptedFunction, buttonStyle, currentMessage) {
    const filter = (button) => button.user.id === message.author.id;
    const { yse, nop } = getButtons("choice", buttonStyle);
    const row = new MessageActionRow({ components: [yse, nop] });
    const reactionMessage = await confirmationMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });
    let processed = false;

    const collector = message.channel.createMessageComponentCollector({ filter, time: defaultChoiceTime });
    collector.on("collect", async (button) => {
        if (!processed) {
            processed = true;
            switch (button.customId) {
                case "yse":
                    await acceptedFunction(reactionMessage)
                        .catch(error => {
                            throw error;
                        });
                    break;
                case "nop":
                    confirmationMessage.editEmbed({ title: "Action cancelled." });
                    await confirmationMessage.sendMessage({ currentMessage: reactionMessage });
                    return confirmationMessage.removeButtons();
                default:
                    break;
            }
        }
    });
    collector.on("end", async () => {
        if (!processed) {
            confirmationMessage.editEmbed({
                title: "Action cancelled automatically.",
                desc: `I can only wait for you for ${defaultChoiceTime / 1000} seconds. Please act quicker next time.`
            });
            await confirmationMessage.sendMessage({ currentMessage: reactionMessage });
            return confirmationMessage.removeButtons();
        }
    });
}

module.exports = confirm;