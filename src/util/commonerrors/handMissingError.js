"use strict";

const { ErrorMessage } = require("../classes/classes.js");

async function handMissingError(message) {
    const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error, it looks like your hand is empty.",
        desc: "Use `cd-sethand` to set a car as your hand.",
        author: message.author
    });
    return errorMessage.sendMessage();
}

module.exports = handMissingError;