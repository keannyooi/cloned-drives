"use strict";

const { registerFont, loadImage, createCanvas } = require("canvas");
const { MessageAttachment } = require("discord.js");
const { InfoMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "benchmark",
    usage: [],
    args: 0,
    category: "Testing",
    description: "A test command for benchmark tests. May also be repurposed for testing throwaway code.",
    async execute(message) {
        //setup

        // test condition 1
        const test1Start = performance.now();
        let attachment = await generate();
        await message.channel.send({ files: [attachment] });
        const test1End = performance.now();

        // test condition 2
        const test2Start = performance.now();
        await  message.channel.send({ files: ["https://cdn.discordapp.com/attachments/995376525119586356/995376817370308658/poc.png"] });
        const test2End = performance.now();

        const resultMessage = new InfoMessage({
            channel: message.channel,
            title: "Benchmark test complete!",
            author: message.author,
            fields: [
                { name: "Test Condition 1", value: `\`${(test1End - test1Start).toFixed(3)}ms\``, inline: true },
                { name: "Test Condition 2", value: `\`${(test2End - test2Start).toFixed(3)}ms\``, inline: true }
            ]
        });
        await resultMessage.sendMessage();

        //additional functions
        async function generate() {
            registerFont("RobotoCondensed-Regular.ttf", { family: "Roboto Condensed" });
            const canvas = createCanvas(500, 304);
            const ctx = canvas.getContext("2d");
            const hud = await loadImage("https://cdn.discordapp.com/attachments/995376525119586356/995376817370308658/poc.png");
            ctx.drawImage(hud, 0, 0, 500, 304);

            ctx.textAlign = "right";
            ctx.fillStyle = "#ffffff";
            ctx.font = '55px "Roboto Condensed"';
            ctx.fillText("130", 492, 50);
            ctx.fillText("6.0", 492, 111);
            ctx.fillText("83", 492, 173);
            ctx.fillText("RWD", 492, 232);
            ctx.fillText("SLK", 492, 292);

            let attachment = new MessageAttachment(canvas.toBuffer(), "event.png");
            return attachment;
        }
    }
};