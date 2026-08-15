"use strict";

/**
 * DUMP EMOJIS
 * ===========
 * Logs in, reads every custom emoji in the home guild, and prints them in
 * copy-pasteable forms — so you never have to type `\:emote:` in chat again.
 *
 * Usage (from repo root):
 *     node scripts/dumpEmojis.js              # all emojis
 *     node scripts/dumpEmojis.js Driver_      # only names containing "Driver_"
 *     node scripts/dumpEmojis.js RR           # only the Race Week event set
 *
 * Read-only: it never writes to Discord or the database.
 */

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const HOME_GUILD_ID = "711769157078876305";
const filter = (process.argv[2] || "").toLowerCase();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
    try {
        const guild = await client.guilds.fetch(HOME_GUILD_ID);
        const emojis = await guild.emojis.fetch();

        const list = [...emojis.values()]
            .filter(emoji => !filter || emoji.name.toLowerCase().includes(filter))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (list.length === 0) {
            console.log(filter ? `No emojis matching "${filter}".` : "No custom emojis found.");
            client.destroy();
            return;
        }

        console.log(`\n=== ${list.length} emoji${list.length === 1 ? "" : "s"}${filter ? ` matching "${filter}"` : ""} ===\n`);

        // 1) Human-readable table
        const pad = Math.max(...list.map(emoji => emoji.name.length));
        for (const emoji of list) {
            console.log(`${emoji.name.padEnd(pad)}  ${emoji.id}  ${emoji.animated ? "(animated) " : ""}${emoji.toString()}`);
        }

        // 2) Ready-to-paste consts block (the shape consts.js already uses)
        console.log("\n=== paste into src/util/consts/consts.js ===\n");
        for (const emoji of list) {
            // moneyEmojiID-style camelCase key from the emoji name
            const key = emoji.name
                .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
                .replace(/^[A-Z]/, first => first.toLowerCase());
            console.log(`    ${key}EmojiID: "${emoji.id}",`);
        }

        // 3) Raw JSON, if you'd rather I wire them up from a paste
        console.log("\n=== JSON (paste this back to Claude) ===\n");
        console.log(JSON.stringify(Object.fromEntries(list.map(emoji => [emoji.name, emoji.id])), null, 2));
        console.log("");
    }
    catch (error) {
        console.error("❌ Failed:", error.message);
    }
    finally {
        client.destroy();
    }
});

client.login(process.env.BOT_TOKEN).catch(error => {
    console.error("❌ Login failed:", error.message);
    process.exit(1);
});
