"use strict";

const { findBestMatch } = require("string-similarity");
const { bugReportsChannelID } = require("../consts/consts.js");
const bot = require("../../config/config.js");
const { AsyncLocalStorage } = require("async_hooks");
const { AttachmentBuilder } = require("discord.js");

// ── Per-user command lock ────────────────────────────────────────────────────
// bot.execList[userID] holds the lock object of the command that player is
// running (index.js processCommand), and execute() runs inside this context
// with that same object as its store. A non-preserve send releases the lock
// only when it comes from the command that owns it — its own execute() chain
// (awaits, .then, timers it set). Dispatcher replies (cooldown, 404, ...) and
// collector callbacks fired after execute() returned carry no matching store,
// so they can no longer free some other command's lock mid-claim.
const commandLockContext = new AsyncLocalStorage();

function runWithCommandLock(lock, fn) {
    return commandLockContext.run(lock, fn);
}

function releaseOwnCommandLock(userID) {
    const lock = commandLockContext.getStore();
    if (lock && bot.execList[userID] === lock) delete bot.execList[userID];
}

// A flow that holds the lock on purpose for an open-ended time (a cd-hilo game
// runs round after round) calls this from its execute() chain and calls the
// returned function on every player action, so index.js's stale-lock takeover
// only ever hits a command that has really stopped. Touching a lock that has
// since been released or taken over changes nothing.
function keepCommandLockAlive() {
    const lock = commandLockContext.getStore();
    return () => { if (lock) lock.startedAt = Date.now(); };
}

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
                iconURL: args.author.displayAvatarURL({ extension: "png" })
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
        // The error behind the last failed sendMessage (null after a good one),
        // so a caller that can't go on without the message can report the real
        // cause instead of dying on `null.message`.
        this.lastError = null;
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
            releaseOwnCommandLock(this.authorID);
        }

        try {
            this.message = currentMessage
                ? await currentMessage.edit(payload)
                : await this.channel.send(payload);

            this.lastError = null;
            return this;
        } catch (error) {
            this.lastError = error;
            console.error("BotMessage.sendMessage failed:", {
                error: error?.message ?? error,
                code: error?.code,
                mode: currentMessage ? "edit" : "send",
                title: this.embed?.title,
                channel: this.channel?.id
            });
            // A failed EDIT used to leave the player staring at the previous
            // screen (e.g. a search picker with its dropdown already removed)
            // with no way forward. Post the result as a new message instead.
            if (currentMessage) {
                try {
                    this.message = await this.channel.send(payload);
                    this.lastError = null;
                    return this;
                } catch (sendError) {
                    console.error("BotMessage.sendMessage fallback send failed:", { error: sendError?.message ?? sendError, code: sendError?.code });
                }
            }

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
                case "color":
                    this.embed.color = value;
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
// Stack characters kept in the report embed: the code fence adds 8 more,
// which keeps the description under Discord's 4096 limit.
const REPORT_STACK_LIMIT = 4000;

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

            // A long error message (a Discord form-body dump, a big mongoose
            // validation error) used to get the whole report rejected. Trim it
            // and attach the full text instead.
            const stack = String(this.stack ?? "No stack trace.");
            const truncated = stack.length > REPORT_STACK_LIMIT;
            let shownStack = truncated ? stack.slice(0, REPORT_STACK_LIMIT) : stack;
            // Don't end on half an emoji: Discord rejects a lone surrogate.
            if (truncated && /[\uD800-\uDBFF]$/.test(shownStack)) shownStack = shownStack.slice(0, -1);

            const reportEmbed = {
                color: 0xfc0303,
                title: `Error report from ${this.unknownSource ? "an unknown source" : source}`,
                description: `\`\`\`\n${shownStack}\n\`\`\``,
                author: {
                    name: bot.user.tag,
                    iconURL: bot.user.displayAvatarURL({ extension: "png" })
                },
                url: this.link,
                footer: {
                    text: "Automatically generated error report."
                },
                timestamp: new Date().toISOString()
            };

            const report = {
                content: this.unknownSource ? "<@!209038568138604546>" : null,
                embeds: [reportEmbed]
            };
            if (!truncated) return await bugReportsChannel.send(report);

            reportEmbed.footer.text = "Automatically generated error report. Trace trimmed, full text attached.";
            try {
                return await bugReportsChannel.send({
                    ...report,
                    files: [new AttachmentBuilder(Buffer.from(stack, "utf8"), { name: "stack.txt" })]
                });
            } catch (attachError) {
                // No Attach Files permission, or the upload failed: the trimmed
                // report still beats losing it to the console.
                console.error("BotError.sendReport attachment failed, sending trimmed report:", attachError?.message ?? attachError);
                reportEmbed.footer.text = "Automatically generated error report. Trace trimmed.";
                return await bugReportsChannel.send(report);
            }
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
    BotError,
    runWithCommandLock,
    releaseOwnCommandLock,
    keepCommandLockAlive
};
