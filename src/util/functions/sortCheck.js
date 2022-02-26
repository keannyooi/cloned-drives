"use strict";

const { ErrorMessage } = require("../classes/classes.js");

function sortCheck(message, sort, currentMessage) {
    switch (sort) {
        case "rq":
        case "handling":
        case "weight":
        case "mra":
        case "ola":
        case "duplicates":
            return sort;
        case "topspeed":
            return "topSpeed";
        case "accel":
            return "0to60";
        default:
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, sorting criteria not found.",
                desc: `Here is a list of sorting criterias. 
                \`-s topspeed\` - Sort by top speed. 
                \`-s accel\` - Sort by acceleration. 
                \`-s handling\` - Sort by handling. 
                \`-s weight\` - Sort by weight. 
                \`-s mra\` - Sort by mid-range acceleraion. 
                \`-s ola\` - Sort by off-the-line acceleration.
                \`-s duplicates\` - Sort by how many copies of the car owned.`,
                author: message.author
            }).displayClosest(sort);
            return errorMessage.sendMessage({ currentMessage });
    }
}

module.exports = sortCheck;