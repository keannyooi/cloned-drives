"use strict";

const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { join } = require("path");
const { readFileSync } = require("fs");
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
        try {
            GlobalFonts.registerFromPath(join(__dirname, "..", "fonts", "RobotoCondensed-Regular.ttf"), "Roboto Condensed");
            GlobalFonts.registerFromPath(join(__dirname, "..", "fonts", "Rubik-BoldItalic.ttf"), "Rubik");
        } catch (err) {
            console.error(`[graphics] font registration failed: ${err.message}`);
        }

        // Template overlays for the HUD/board renderers. Bundled in the repo
        // (src/graphics) and read from disk — no network dependency, so a blip to
        // the image host can't leave bot.graphics empty and silently break every
        // drawImage the way fetching these at startup did.
        const dir = join(__dirname, "..", "graphics");
        const sources = {
            raceTemp: "race_template_thing.png",
            dealerTemp: "zecardsandbids.png",
            eventTemp: "voWCtQc.png"
        };
        for (const [key, file] of Object.entries(sources)) {
            try {
                this.graphics[key] = await loadImage(readFileSync(join(dir, file)));
            } catch (err) {
                console.error(`[graphics] failed to load ${key} (${file}): ${err.message}`);
            }
        }
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

bot.loadGraphics().catch(err => console.error("[graphics] loadGraphics crashed:", err));

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