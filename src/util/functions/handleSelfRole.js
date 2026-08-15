"use strict";

/**
 * SELF-ASSIGN ROLE BUTTONS
 * ========================
 * Routes clicks from the #auto-assign-roles panel (posted by cd-rolepanel).
 *
 * These buttons are persistent — the panel outlives any collector, so this
 * runs off the global interactionCreate listener in index.js rather than a
 * per-message collector like the rest of the bot's buttons.
 *
 * SECURITY: the customId arrives from the client and cannot be trusted. The
 * role ID it names is checked against the `selfAssignRoles` whitelist in
 * consts.js before anything is granted, so a forged interaction can only ever
 * toggle a role that is already opt-in — never an admin or staff role.
 */

const { selfAssignRoles } = require("../consts/consts.js");

const CUSTOM_ID_PREFIX = "selfrole";

async function handleSelfRoleInteraction(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) return false;
    if (!interaction.guild) return false;

    const roleID = interaction.customId.slice(CUSTOM_ID_PREFIX.length + 1);
    const entry = (selfAssignRoles || []).find(role => role.roleID === roleID);
    if (!entry) {
        // Panel is older than the current whitelist — the role was retired.
        await interaction.reply({
            content: "That role isn't self-assignable any more. Ask an admin to refresh this panel.",
            ephemeral: true
        }).catch(() => {});
        return true;
    }

    try {
        const role = await interaction.guild.roles.fetch(roleID).catch(() => null);
        if (!role) {
            await interaction.reply({
                content: `The **${entry.label}** role no longer exists — an admin needs to fix the panel.`,
                ephemeral: true
            });
            return true;
        }

        const member = interaction.member.roles
            ? interaction.member
            : await interaction.guild.members.fetch(interaction.user.id);

        const hasRole = member.roles.cache.has(roleID);
        if (hasRole) {
            await member.roles.remove(role);
            await interaction.reply({
                content: `${entry.emoji} Removed **${entry.label}** — you'll no longer be pinged for this.`,
                ephemeral: true
            });
        }
        else {
            await member.roles.add(role);
            await interaction.reply({
                content: `${entry.emoji} You now have **${entry.label}** — ${entry.description.toLowerCase()}.`,
                ephemeral: true
            });
        }
    }
    catch (error) {
        // Overwhelmingly the cause is role hierarchy: Manage Roles is not
        // enough, the bot's own highest role must sit ABOVE the role it grants.
        console.log(`[SelfRole] failed to toggle ${roleID} for ${interaction.user.id}: ${error.message}`);
        await interaction.reply({
            content: "Something went wrong assigning that role — an admin has been notified.",
            ephemeral: true
        }).catch(() => {});
    }
    return true;
}

module.exports = { handleSelfRoleInteraction, CUSTOM_ID_PREFIX };
