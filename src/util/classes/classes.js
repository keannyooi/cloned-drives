"use strict";

const { findBestMatch } = require("string-similarity");
const { bugReportsChannelID } = require("../consts/consts.js");
const bot = require("../../config/config.js");

/**
 * Base message class for embeds
 * HARDENED against Discord / undici failures
 */
class BotMessage {
    constructor(args) {
        this.channel = args.channel;
        this.authorID = args.author.id;

        this.embed = {
            title: args.title ?? null,
            description: args.desc ?? null,
            color: null,
            author: {
                name: args.author.tag,
                iconURL: args.author.displayAvatarURL({ format: "png", dynamic: true })
            },
            fields: Array.isArray(args.fields) ? args.fields : [],
            footer: {
                text: args.footer ?? null
            },
            timestamp: new Date().toISOString()
        };

        // ✅ SAFE thumbnail handling
        if (typeof args.thumbnail === "string" && args.thumbnail.startsWith("http")) {
            this.embed.thumbnail = { url: args.thumbnail };
        }

        // ✅ SAFE image handling
        if (typeof args.image === "string" && args.image.startsWith("http")) {
            this.embed.image = { url: args.image };
        }

        this.message = null;
    }

    /**
     * Sends or edits the message safely
     * NEVER throws — prevents process crashes
     */
    async sendMessage(args = {}) {
        let currentMessage = args?.currentMessage?.message ?? null;

        const payload = {
            embeds: [this.embed],
            components: Array.isArray(args.buttons) ? args.buttons : []
        };

        // ✅ Safe attachment handling
        if (args.attachment) {
            payload.files = [args.attachment];
            this.embed.image = {
                url: `attachment://${args.attachment.name}`
            };
        }

        if (!args.preserve) {
            bot.deleteID(this.authorID);
        }

        try {
            this.message = currentMessage
                ? await currentMessage.edit(payload)
                : await this.channel.send(payload);

            return this;
        } catch (error) {
            console.error("BotMessage.sendMessage failed:", {
                error: error?.message ?? error,
                channel: this.channel?.id
            });

            return null; // ⛔ swallow error, prevent crash
        }
    }

    /**
     * Safely edits embed fields
     */
    editEmbed(args = {}) {
        for (const [key, value] of Object.entries(args)) {
            switch (key) {
                case "title":
                    this.embed.title = value;
                    break;
                case "desc":
                    this.embed.description = value;
                    break;
                case "fields":
                    if (Array.isArray(value)) {
                        this.embed.fields.push(...value);
                    }
                    break;
                case "footer":
                    this.embed.footer.text = value;
                    break;
                default:
                    break;
            }
        }
        return this;
    }

    /**
     * Removes buttons safely
     */
    async removeButtons() {
        if (!this.message) return null;

        try {
            return await this.message.edit({
                embeds: [this.embed],
                components: []
            });
        } catch (error) {
            console.error("removeButtons failed:", error);
            return null;
        }
    }
}

/**
 * SUCCESS MESSAGE
 */
class SuccessMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.color = 0x03fc24;
    }
}

/**
 * ERROR MESSAGE
 */
class ErrorMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.color = 0xfc0303;
    }

    displayClosest(received, checkArray) {
        this.embed.fields = [
            { name: "Value Received", value: `\`${received}\``, inline: true }
        ];

        if (Array.isArray(checkArray)) {
            const matches = findBestMatch(received, checkArray);
            if (matches?.bestMatch?.target) {
                this.embed.fields.push({
                    name: "You may be looking for",
                    value: `\`${matches.bestMatch.target}\``,
                    inline: true
                });
            }
        }

        return this;
    }
}

/**
 * INFO MESSAGE
 */
class InfoMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.color = 0x34aeeb;
    }
}

/**
 * BOT ERROR REPORTER
 */
class BotError {
    constructor(args) {
        this.stack = args.stack;
        this.guild = args.guild;
        this.channel = args.channel;
        this.message = args.message;
        this.unknownSource = args.unknownSource;

        if (this.guild && this.channel && this.message) {
            this.link = `https://discord.com/channels/${args.guild.id}/${args.channel.id}/${args.message.id}`;
        }
    }

    async sendReport() {
        try {
            const bugReportsChannel = await bot.homeGuild.channels.fetch(bugReportsChannelID);

            const source = this.link
                ? `guild ${this.guild.name} in #${this.channel.name}`
                : "a DM channel";

            const reportEmbed = {
                color: 0xfc0303,
                title: `Error report from ${this.unknownSource ? "an unknown source" : source}`,
                description: `\`\`\`\n${this.stack}\n\`\`\``,
                author: {
                    name: bot.user.tag,
                    iconURL: bot.user.displayAvatarURL({ format: "png", dynamic: true })
                },
                url: this.link,
                footer: {
                    text: "Automatically generated error report."
                },
                timestamp: new Date().toISOString()
            };

            return await bugReportsChannel.send({
                content: this.unknownSource ? "<@!209038568138604546>" : null,
                embeds: [reportEmbed]
            });
        } catch (error) {
            console.error("BotError.sendReport failed:", error);
            return null;
        }
    }
}

module.exports = {
    SuccessMessage,
    InfoMessage,
    ErrorMessage,
    BotError
};
