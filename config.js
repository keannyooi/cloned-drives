"use strict";

const { Client, Collection, Intents } = require("discord.js");
const { DateTime } = require("luxon");
const { loadImage } = require("canvas");

class Bot extends Client {
    constructor(intents, devMode) {
        super(intents);
        this.devMode = devMode;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.execList = {};
        this.awakenTime = DateTime.now();
        this.graphics = {};
    }

    deleteID(id) {
        delete this.execList[id];
    }

    async loadGraphics() {
        await Promise.all([
            loadImage("https://cdn.discordapp.com/attachments/716917404868935691/795177817116901386/race_template_thing.png"),
            loadImage("https://cdn.discordapp.com/attachments/715771423779455077/799579880819785778/unknown.png"),
            loadImage("https://cdn.discordapp.com/attachments/716917404868935691/801292983496474624/test.png"),
            loadImage("https://cdn.discordapp.com/attachments/716917404868935691/744882896828891136/deck_screen.png"),
            loadImage("https://cdn.discordapp.com/attachments/715771423779455077/848829168234135552/deck_thing.png")
        ])
            .then(loaded => {
                let [raceTemp, dealerTemp, eventTemp, deckTemp, deckSelectTemp] = loaded;
                this.graphics = { raceTemp, dealerTemp, eventTemp, deckTemp, deckSelectTemp }
            });
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

bot.loadGraphics();
module.exports = bot;