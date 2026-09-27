"use strict";

/**
 * cd-applyreqs — shortcut for `cd-filter applyreqs …`: replaces your garage
 * filter with a race's requirements, so a legal car is one `cd-g` away.
 *
 *   cd-applyreqs                          your current Random Race
 *   cd-applyreqs event <event name>       the round you're on in that event
 *   cd-applyreqs championship <name>      the round you're on in that championship
 *
 * Delegates to the filter command, so there is exactly one implementation
 * and one set of messages.
 */

const filterCommand = require("./filter.js");

module.exports = {
    name: "applyreqs",
    aliases: ["applyreq"],
    usage: ["[rr]", "event <event name>", "championship <championship name>"],
    args: 0,
    category: "Configuration",
    description: "Replaces your filter with a race's requirements: your Random Race, or the round you're on in an event or championship.",
    async execute(message, args) {
        // With no category, the Random Race is meant — the original use.
        const [category = "rr", ...rest] = args;
        return filterCommand.execute(message, ["applyreqs", category, ...rest]);
    }
};
