"use strict";

const { findBestMatch } = require("string-similarity");
const { MessageEmbed } = require("discord.js");
const bot = require("../../config.js");

class BotMessage {
    constructor(args) {
        this.embed = new MessageEmbed({
            title: args.title,
            description: args.desc,
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
            footer: args.footer ?? null
        }).setTimestamp();
        this.channel = args.channel;
        this.authorID = args.author.id;
    }
    async sendMessage(args) {
        let currentMessage = args?.currentMessage?.message;
        let contents = { embeds: [this.embed], components: args?.buttons ?? [] };
        if (!args?.preserve) {
            bot.deleteID(this.authorID);
        }
        this.message = currentMessage ? await currentMessage.edit(contents) : await this.channel.send(contents);
        return this;
    }
    addFields(fields) {
        this.embed.addFields(fields);
        return this;
    }
    setFooter(footer) {
        this.embed.setFooter(footer);
        return this;
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
    removeButtons() {
        return this.message.edit({ embeds: [this.embed], components: [] });
    }
}

module.exports = {
    SuccessMessage,
    InfoMessage,
    ErrorMessage
};