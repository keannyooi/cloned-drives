"use strict";

const { Client, Collection, Intents } = require("discord.js");
const { DateTime } = require("luxon");
class Bot extends Client {
    constructor(intents, devMode) {
        super(intents);
        this.devMode = devMode;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.execList = {};
        this.awakenTime = DateTime.now();
    }
    deleteID(id) {
        delete this.execList[id];
    }
}

const bot = new Bot({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.DIRECT_MESSAGES
    ],
    partials: ["CHANNEL"]
}, true); //<------------- devMode is here
module.exports = bot;