"use strict";

/**
 * SELF-ASSIGN ROLE PANEL
 * ======================
 * Posts (or refreshes) the button panel in #auto-assign-roles. The buttons are
 * PERSISTENT — they carry no collector, so they keep working across restarts;
 * clicks are routed by the interactionCreate listener in index.js.
 *
 * Re-run this after editing `selfAssignRoles` in consts.js to refresh the panel.
 * Pass a message ID to edit that panel in place instead of posting a new one.
 */

const bot = require("../config/config.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { adminRoleID, autoAssignRolesChannelID, selfAssignRoles } = require("../util/consts/consts.js");

// customId prefix the index.js router matches on. Changing this orphans every
// panel already posted, so they would need re-posting.
const CUSTOM_ID_PREFIX = "selfrole";

/** The panel's embed + button rows, built from the consts whitelist. */
function buildPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔔 Notification Roles")
        .setDescription(
            "Click a button to give yourself a role, click it again to take it off.\n"
            + "Nobody else sees these — only you get the reply.\n\n"
            + selfAssignRoles.map(role => `${role.emoji} **${role.label}** — ${role.description}`).join("\n")
        );

    // Discord allows 5 buttons per row, 5 rows per message.
    const rows = [];
    for (let index = 0; index < selfAssignRoles.length; index += 5) {
        rows.push(new ActionRowBuilder().addComponents(
            selfAssignRoles.slice(index, index + 5).map(role => new ButtonBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}:${role.roleID}`)
                .setLabel(role.label)
                .setEmoji(role.emoji)
                .setStyle(ButtonStyle.Secondary))
        ));
    }
    return { embeds: [embed], components: rows };
}

module.exports = {
    name: "rolepanel",
    aliases: ["roles", "selfroles"],
    usage: ["", "<messageID>"],
    args: 0,
    category: "Admin",
    description: "Posts the self-assign role panel in the auto-assign-roles channel. Pass an existing panel's message ID to update it in place.",
    async execute(message, args) {
        if (!message.member.roles.cache.has(adminRoleID)) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, this command is admin-only.",
                desc: "Only admins can post the role panel.",
                author: message.author
            }).sendMessage();
        }

        if (!Array.isArray(selfAssignRoles) || selfAssignRoles.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no self-assignable roles are configured.",
                desc: "Add entries to `selfAssignRoles` in `src/util/consts/consts.js` first.",
                author: message.author
            }).sendMessage();
        }

        const channel = await bot.homeGuild.channels.fetch(autoAssignRolesChannelID).catch(() => null);
        if (!channel) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, the auto-assign-roles channel could not be found.",
                desc: `Check \`autoAssignRolesChannelID\` (currently \`${autoAssignRolesChannelID}\`).`,
                author: message.author
            }).sendMessage();
        }

        // Fail loudly here rather than letting every button click fail later.
        const missing = [];
        for (const role of selfAssignRoles) {
            const resolved = await bot.homeGuild.roles.fetch(role.roleID).catch(() => null);
            if (!resolved) missing.push(`${role.label} (\`${role.roleID}\`)`);
        }
        if (missing.length > 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, some configured roles do not exist.",
                desc: `The following could not be resolved:\n${missing.join("\n")}`,
                author: message.author
            }).sendMessage();
        }

        const panel = buildPanel();
        const targetID = args[0];

        try {
            if (targetID) {
                const existing = await channel.messages.fetch(targetID);
                await existing.edit(panel);
                return new SuccessMessage({
                    channel: message.channel,
                    title: "Successfully updated the role panel!",
                    desc: `Edited [this panel](${existing.url}) in <#${autoAssignRolesChannelID}>.`,
                    author: message.author
                }).sendMessage();
            }
            const posted = await channel.send(panel);
            return new SuccessMessage({
                channel: message.channel,
                title: "Successfully posted the role panel!",
                desc: `Posted [here](${posted.url}) in <#${autoAssignRolesChannelID}>.\n`
                    + `To update it later without re-posting: \`cd-rolepanel ${posted.id}\``,
                author: message.author
            }).sendMessage();
        }
        catch (error) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, the panel could not be posted.",
                desc: `\`${error.message}\``,
                author: message.author
            }).sendMessage();
        }
    },
    buildPanel,
    CUSTOM_ID_PREFIX
};
