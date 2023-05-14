"use strict";

const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { DateTime } = require("luxon");
const { loadImage } = require("canvas");
const { spawn } = require("child_process");
const { schedule } = require("node-cron");

class Bot extends Client {
    constructor(intents) {
        super(intents);
        this.devMode = intents.devMode;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.execList = {};
        this.awakenTime = DateTime.now();
        this.graphics = {};
    }

    deleteID(id) {
        delete this.execList[id];
    }

    async fetchHomeGuild() {
        this.homeGuild = await this.guilds.fetch("711769157078876305");
    }

    async loadGraphics() {
        await Promise.all([
            loadImage("https://media.discordapp.net/attachments/716917404868935691/795177817116901386/race_template_thing.png"),
            loadImage("https://media.discordapp.net/attachments/715771423779455077/1107238347283370014/98Rxd9z.png"),
            loadImage("https://media.discordapp.net/attachments/715771423779455077/1107238347539238932/voWCtQc.png")
        ])
            .then(loaded => {
                let [raceTemp, dealerTemp, eventTemp] = loaded;
                this.graphics = { raceTemp, dealerTemp, eventTemp }
            });
    }
}

const bot = new Bot({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    devMode: process.argv[2]?.toLowerCase() === "dev" ? true : false
});

bot.loadGraphics();

if (bot.devMode) {
    schedule("30 * * * *", () => {
        spawn("mongodump", [
            `--uri=${process.env.MONGO_URI}`,
            "--gzip"
        ])
            .on("exit", (code, signal) => {
                if (code) {
                    console.error("database backup process exited with code ", code);
                }
                else if (signal) {
                    console.error("database backup process killed with signal ", signal);
                }
                else {
                    console.log("database backup success!");
                }
            });
    });
}

module.exports = bot;