"use strict";

const { findBestMatch } = require("string-similarity");
const { MessageEmbed } = require("discord.js");
const bot = require("../../config.js");

class BotMessage {
    constructor(args) {
        this.embed = new MessageEmbed({
            title: args.title,
            description: args.desc ?? null,
            author: {
                name: args.author.tag,
                iconURL: args.author.displayAvatarURL({ format: "png", dynamic: true })
            },
            thumbnail: {
                url: args.thumbnail
            },
            image: {
                url: args.image
            },
            fields: args.fields,
            footer: {
                text: args.footer ?? null
            }
        }).setTimestamp();
        this.channel = args.channel;
        this.authorID = args.author.id;
    }

    async sendMessage(args) {
        let currentMessage = args?.currentMessage?.message;
        let contents = { embeds: [this.embed], components: args?.buttons ?? [], files: null };
        if (args?.attachment) {
            contents.files = [args?.attachment];
            this.embed.setImage(`attachment://${args?.attachment["name"]}`);
        }
    
        if (!args?.preserve) {
            bot.deleteID(this.authorID);
        }
        try {
            this.message = currentMessage ? await currentMessage.edit(contents) : await this.channel.send(contents);
            return this;
        }
        catch (error) {
            throw error;
        }
    }

    editEmbed(args) {
        for (let [key, value] of Object.entries(args)) {
            switch (key) {
                case "title":
                    this.embed.setTitle(value);
                    break;
                case "desc":
                    this.embed.setDescription(value);
                    break;
                case "fields":
                    this.embed.addFields(value);
                    break;
                case "footer":
                    this.embed.setFooter({ text: value });
                    break;
                default:
                    break;
            }
        }
        return this;
    }

    removeButtons() {
        return this.message.edit({ embeds: [this.embed], components: [] });
    } 
}

class SuccessMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.setColor("#03fc24");
    }
}

class ErrorMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.setColor("#fc0303");
    }

    displayClosest(received, checkArray) {
        this.embed.addField("Value Received", `\`${received}\``, true);
        if (checkArray) {
            let matches = findBestMatch(received, checkArray);
            this.embed.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true);
        }
        return this;
    }
}

class InfoMessage extends BotMessage {
    constructor(args) {
        super(args);
        this.embed.setColor("#34aeeb");
    }
}

class BotError {
    constructor(args) {
        this.stack = args.stack;
        this.guild = args.guild;
        this.channel = args.channel;
        this.message = args.message;
        this.isFatal = args.isFatal;
        if (this.guild && this.channel && this.message) {
            this.link = `https://discord.com/channels/${args.guild.id}/${args.channel.id}/${args.message.id}`;
        }
    }

    async sendReport() {
        const guild = await bot.guilds.fetch("711769157078876305");
        const bugReportsChannel = await guild.channels.fetch("750304569422250064");
        const source = (this.link) ? `guild ${this.guild.name} in #${this.channel.name}` : "a DM channel";
        const reportMessage = new MessageEmbed({
            title: this.isFatal ? "FATAL ERROR: FIX THIS IMMEDIATELY" : `Error report from ${source}`,
            description: `\`${this.stack}\``,
            author: {
                name: bot.user.tag,
                iconURL: bot.user.displayAvatarURL({ format: "png", dynamic: true })
            },
            url: this.link,
            color: [252, 3, 3],
            footer: {
                text: "This report is automatically generated by the bot's error detection system."
            }
        }).setTimestamp();
        return bugReportsChannel.send({ content: this.isFatal ? "<@!494120116422967325>" : null, embeds: [reportMessage] });
    }
}

module.exports = {
    SuccessMessage,
    InfoMessage,
    ErrorMessage,
    BotError
};