"use strict";

module.exports = {
    name: "ping",
    usage: "(no arguments required)",
    args: 0,
    category: "Miscellaneous",
    description: "Shows the current bot and API latency.",
    execute(message) {
        message.channel.send(`bruh y u ping me
anyway latency = \`${Date.now() - (message.editedTimestamp || message.createdTimestamp)}ms\` while api latency = \`${Math.round(message.client.ws.ping)}ms\`
		`);
        delete message.client.execList[message.author.id];
    }
};