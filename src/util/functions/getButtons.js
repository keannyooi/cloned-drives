"use strict";

const { ButtonBuilder, ButtonStyle } = require("discord.js");
const { Primary, Secondary, Success, Danger } = ButtonStyle;

function getButtons(type, buttonStyle) {
    switch (type) {
        case "menu":
            let firstPage, prevPage, nextPage, lastPage;
            if (buttonStyle === "classic") {
                firstPage = new ButtonBuilder()
                    .setCustomId("firstPage")
                    .setEmoji("⏪")
                    .setStyle(Secondary);
                prevPage = new ButtonBuilder()
                    .setCustomId("prevPage")
                    .setEmoji("⬅️")
                    .setStyle(Secondary);
                nextPage = new ButtonBuilder()
                    .setCustomId("nextPage")
                    .setEmoji("➡️")
                    .setStyle(Secondary);
                lastPage = new ButtonBuilder()
                    .setCustomId("lastPage")
                    .setEmoji("⏩")
                    .setStyle(Secondary);
            }
            else {
                firstPage = new ButtonBuilder()
                    .setCustomId("firstPage")
                    .setLabel("<<")
                    .setStyle(Danger);
                prevPage = new ButtonBuilder()
                    .setCustomId("prevPage")
                    .setLabel("<")
                    .setStyle(Primary);
                nextPage = new ButtonBuilder()
                    .setCustomId("nextPage")
                    .setLabel(">")
                    .setStyle(Primary);
                lastPage = new ButtonBuilder()
                    .setCustomId("lastPage")
                    .setLabel(">>")
                    .setStyle(Danger);
            }
            return { firstPage, prevPage, nextPage, lastPage };
        case "choice":
        case "rr":
            let yse, nop, skip;
            if (buttonStyle === "classic") {
                yse = new ButtonBuilder()
                    .setCustomId("yse")
                    .setEmoji("✅")
                    .setStyle(Secondary);
                nop = new ButtonBuilder()
                    .setCustomId("nop")
                    .setEmoji("❎")
                    .setStyle(Secondary);
                if (type === "rr") {
                    skip = new ButtonBuilder()
                        .setCustomId("skip")
                        .setEmoji("⏩")
                        .setStyle(Secondary);
                }
            }
            else {
                yse = new ButtonBuilder()
                    .setCustomId("yse")
                    .setLabel("YES, DO IT!")
                    .setStyle(Success);
                nop = new ButtonBuilder()
                    .setCustomId("nop")
                    .setLabel("No, I'm not ready!")
                    .setStyle(Danger);
                if (type === "rr") {
                    skip = new ButtonBuilder()
                        .setCustomId("skip")
                        .setLabel("I give up. (Skips and resets streak)")
                        .setStyle(Primary);
                }
            }
            return { yse, nop, skip };
        default:
            return;
    }
}

module.exports = getButtons;