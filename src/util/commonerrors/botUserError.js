"use strict";

const { ErrorMessage } = require("../classes/classes.js");

async function botUserError(message) {
    const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error, user requested is a bot.",
        desc: "Bots can't play Cloned Drives.",
        author: message.author
    });
    return errorMessage.sendMessage();
}

module.exports = botUserError;