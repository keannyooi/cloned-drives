"use strict";

const { readFileSync } = require("fs");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { DateTime } = require("luxon");
const { loadImage } = require("canvas");
const { spawn } = require("child_process");
const { schedule } = require("node-cron");

const dealerTemplate = readFileSync("./src/assets/imgs/dealership.png");
const eventTemplate = readFileSync("./src/assets/imgs/cell.png");

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

    async fetchHomeGuild() {
        this.homeGuild = await this.guilds.fetch("711769157078876305");
    }

    async loadGraphics() {
        await Promise.all([
            loadImage("https://cdn.discordapp.com/attachments/715771423779455077/799579880819785778/unknown.png"),
            loadImage(dealerTemplate),
            loadImage(eventTemplate)
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
    partials: [Partials.Channel]
}, true); //<------------- devMode is here

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