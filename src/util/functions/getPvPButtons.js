"use strict";

/**
 * PvP Button Definitions
 * Add these cases to your existing getButtons.js switch statement
 */

const { ButtonBuilder, ButtonStyle: { Primary, Secondary, Success, Danger } } = require("discord.js");

function getPvPButtons(type, buttonStyle) {
    switch (type) {
        // Main PvP hub buttons
        case "pvp_hub": {
            const attack = new ButtonBuilder()
                .setCustomId("pvp_attack")
                .setLabel("⚔️ Attack")
                .setStyle(Primary);
            
            const defense = new ButtonBuilder()
                .setCustomId("pvp_defense")
                .setLabel("🛡️ Defense")
                .setStyle(Secondary);
            
            const season = new ButtonBuilder()
                .setCustomId("pvp_season")
                .setLabel("🏆 Season")
                .setStyle(Secondary);
            
            const history = new ButtonBuilder()
                .setCustomId("pvp_history")
                .setLabel("📜 History")
                .setStyle(Secondary);
            
            return { attack, defense, season, history };
        }
        
        // Opponent selection buttons
        case "pvp_opponents": {
            const opp1 = new ButtonBuilder()
                .setCustomId("pvp_opp_1")
                .setLabel("1")
                .setStyle(Primary);
            
            const opp2 = new ButtonBuilder()
                .setCustomId("pvp_opp_2")
                .setLabel("2")
                .setStyle(Primary);
            
            const opp3 = new ButtonBuilder()
                .setCustomId("pvp_opp_3")
                .setLabel("3")
                .setStyle(Primary);
            
            const refresh = new ButtonBuilder()
                .setCustomId("pvp_refresh")
                .setLabel("🔄 Refresh")
                .setStyle(Secondary);
            
            const cancel = new ButtonBuilder()
                .setCustomId("pvp_cancel")
                .setLabel("❌ Cancel")
                .setStyle(Danger);
            
            return { opp1, opp2, opp3, refresh, cancel };
        }
        
        // Battle start buttons
        case "pvp_battle": {
            const start = new ButtonBuilder()
                .setCustomId("pvp_start_battle")
                .setLabel("⚔️ START BATTLE")
                .setStyle(Success);
            
            const cancel = new ButtonBuilder()
                .setCustomId("pvp_cancel")
                .setLabel("❌ Cancel")
                .setStyle(Danger);
            
            return { start, cancel };
        }
        
        // Defense setup buttons
        case "pvp_defense_setup": {
            const save = new ButtonBuilder()
                .setCustomId("pvp_save_defense")
                .setLabel("✅ Save Defense")
                .setStyle(Success);
            
            const clear = new ButtonBuilder()
                .setCustomId("pvp_clear_defense")
                .setLabel("🗑️ Clear All")
                .setStyle(Danger);
            
            const cancel = new ButtonBuilder()
                .setCustomId("pvp_cancel")
                .setLabel("❌ Cancel")
                .setStyle(Secondary);
            
            return { save, clear, cancel };
        }
        
        // Car removal during setup
        case "pvp_car_actions": {
            const remove1 = new ButtonBuilder()
                .setCustomId("pvp_remove_1")
                .setLabel("Remove #1")
                .setStyle(Danger);
            
            const remove2 = new ButtonBuilder()
                .setCustomId("pvp_remove_2")
                .setLabel("Remove #2")
                .setStyle(Danger);
            
            const remove3 = new ButtonBuilder()
                .setCustomId("pvp_remove_3")
                .setLabel("Remove #3")
                .setStyle(Danger);
            
            const remove4 = new ButtonBuilder()
                .setCustomId("pvp_remove_4")
                .setLabel("Remove #4")
                .setStyle(Danger);
            
            const remove5 = new ButtonBuilder()
                .setCustomId("pvp_remove_5")
                .setLabel("Remove #5")
                .setStyle(Danger);
            
            return { remove1, remove2, remove3, remove4, remove5 };
        }
        
        // League selection
        case "pvp_leagues": {
            const buttons = {};
            const leagues = [
                { id: "standard", emoji: "⬜" },
                { id: "common", emoji: "🟫" },
                { id: "uncommon", emoji: "🟩" },
                { id: "rare", emoji: "🟦" },
                { id: "epic", emoji: "🟪" },
                { id: "exotic", emoji: "🟨" },
                { id: "legendary", emoji: "🟧" },
                { id: "mystic", emoji: "🔮" },
                { id: "unlimited", emoji: "🔴" }
            ];
            
            for (const league of leagues) {
                buttons[league.id] = new ButtonBuilder()
                    .setCustomId(`pvp_league_${league.id}`)
                    .setLabel(`${league.emoji} ${league.id.charAt(0).toUpperCase() + league.id.slice(1)}`)
                    .setStyle(Secondary);
            }
            
            return buttons;
        }
        
        // Confirmation buttons
        case "pvp_confirm": {
            const confirm = new ButtonBuilder()
                .setCustomId("pvp_confirm")
                .setLabel("✅ Confirm")
                .setStyle(Success);
            
            const cancel = new ButtonBuilder()
                .setCustomId("pvp_cancel")
                .setLabel("❌ Cancel")
                .setStyle(Danger);
            
            return { confirm, cancel };
        }
        
        // Defense change confirmation
        case "pvp_defense_confirm": {
            const confirm = new ButtonBuilder()
                .setCustomId("pvp_confirm_change")
                .setLabel("✅ Change Defense")
                .setStyle(Primary);
            
            const cancel = new ButtonBuilder()
                .setCustomId("pvp_cancel")
                .setLabel("❌ Keep Current")
                .setStyle(Secondary);
            
            return { confirm, cancel };
        }
        
        // Pagination for history/leaderboard
        case "pvp_pagination": {
            const prev = new ButtonBuilder()
                .setCustomId("pvp_prev_page")
                .setLabel("◀")
                .setStyle(Secondary);
            
            const next = new ButtonBuilder()
                .setCustomId("pvp_next_page")
                .setLabel("▶")
                .setStyle(Secondary);
            
            const close = new ButtonBuilder()
                .setCustomId("pvp_close")
                .setLabel("✖")
                .setStyle(Danger);
            
            return { prev, next, close };
        }
        
        default:
            throw new Error(`getPvPButtons: Unknown button type "${type}"`);
    }
}

module.exports = getPvPButtons;
