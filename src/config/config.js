"use strict";

const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { join } = require("path");
const { readFileSync } = require("fs");
const { DateTime } = require("luxon");
const { GlobalFonts, loadImage } = require("@napi-rs/canvas");

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

    // Releases the player's command lock only when called from the execute()
    // chain of the command that holds it (classes.js), so a hung command that
    // was taken over as stale can't free the new command's lock. Lazy require:
    // classes.js requires this file.
    deleteID(id) {
        require("../util/classes/classes.js").releaseOwnCommandLock(id);
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

// Database backups are taken by scripts/backupDatabase.js on a Windows
// scheduled task (every 2 hours, one week kept), not by the bot.

module.exports = bot;