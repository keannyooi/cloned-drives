"use strict";

const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { join } = require("path");
const { DateTime } = require("luxon");
const { GlobalFonts, loadImage } = require("@napi-rs/canvas");
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
        GlobalFonts.registerFromPath(join(__dirname, "..", "fonts", "RobotoCondensed-Regular.ttf"), "Roboto Condensed");
        GlobalFonts.registerFromPath(join(__dirname, "..", "fonts", "Rubik-BoldItalic.ttf"), "Rubik");

        await Promise.all([
            loadImage("https://file.garden/ZSrBMiDRyR84aPJp/race_template_thing.png"),
            loadImage("https://file.garden/ZSrBMiDRyR84aPJp/zecardsandbids.png"),
            loadImage("https://file.garden/ZSrBMiDRyR84aPJp/voWCtQc.png")
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