"use strict";

const { InfoMessage } = require("./sharedfiles/classes.js");

module.exports = {
    name: "ping",
    usage: [],
    args: 0,
    category: "Miscellaneous",
    description: "Shows the current bot and API latency.",
    execute(message) {
        let pingMessage = new InfoMessage({
            channel: message.channel,
            title: "bruh y u ping me",
            author: message.author,
            fields: [
                { name: "Bot Latency", value: `\`${Date.now() - (message.editedTimestamp || message.createdTimestamp)}ms\``, inline: true },
                { name: "API Latency", value: `\`${Math.round(message.client.ws.ping)}ms\``, inline: true }
            ]
        });
        return pingMessage.sendMessage();
    }
};