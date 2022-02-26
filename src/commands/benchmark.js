"use strict";

const { InfoMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "benchmark",
    usage: [],
    args: 0,
    category: "Testing",
    description: "A test command for benchmark tests. May also be repurposed for testing throwaway code.",
    execute(message) {
        //setup
        
        // test condition 1
        const test1Start = performance.now();

        const test1End = performance.now();

        // test condition 2
        const test2Start = performance.now();

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
        return resultMessage.sendMessage();

        //additional functions
    }
};