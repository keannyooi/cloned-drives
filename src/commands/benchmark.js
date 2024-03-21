"use strict";

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
        // let attachment = await generate();
        // await message.channel.send({ files: [attachment] });
        const test1End = performance.now();

        // test condition 2
        const test2Start = performance.now();
        // await  message.channel.send({ files: ["https://cdn.discordapp.com/attachments/995376525119586356/995376817370308658/poc.png"] });
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
    }
};