"use strict";

const { InfoMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "ping",
    usage: [],
    args: 0,
    category: "Miscellaneous",
    description: "Shows the current bot and API latency. may or may not have a few quotes.",
    async execute(message) {
        const sent = await message.channel.send("🏓 Here I go.");

        const botLatency = sent.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(message.client.ws.ping);

        const responses = [
            "Ooof, nobody saw that right?️",
            "Stay ready. I'm gonna boost off your slipstream!",
            "Step aside! I've got places to be!",
            "Thanks! I'm back in the race!",
			"Accelerating is exhilarating! Thanks!",
			"Bam! Right up the tailpipe!",
			"Huge boost! Thanks!",
			"I'm road!",
			"These guys make me nervous!",
			"Nothing gets in my way and survives!",
			"It takes more than a wall to stop me!",
			"You're the best!",
			"Yes! Plowin' through like a tank!",
			"Whoa! That's fast!",
			"Watch it!",
			"That shouldn't have been there!",
			"Takes more than that to slow me down.",
			"Later, suckers!",
			"Well, that was unpleasant!",
			"That was your fault!",
			"Stupid move on my part.",
			"Ow! Hey!",
			"Ha! Not bad!",
            "Yeah, that's the boost I needed!"
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];

        const pingMessage = new InfoMessage({
            channel: message.channel,
            title: "🏓 Get the message?",
            desc: randomResponse,
            author: message.author,
            fields: [
                { name: "Bot Latency", value: `\`${botLatency}ms\``, inline: true },
                { name: "API Latency", value: `\`${apiLatency}ms\``, inline: true }
            ]
        });

        await sent.delete(); // Clean up the temp message
        return pingMessage.sendMessage();
    }
};