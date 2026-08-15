"use strict";

const { ButtonBuilder, ButtonStyle: { Primary, Secondary, Success, Danger } } = require("discord.js");

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
                    .setEmoji("❌")
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
                        .setLabel("Skip (new opponent)")
                        .setStyle(Primary);
                }
            }
            return { yse, nop, skip };

		case "hilo":
            let high, low, skipHilo;

            if (buttonStyle === "classic") {
                high = new ButtonBuilder()
                    .setCustomId("high")
                    .setEmoji("⬆️")
                    .setStyle(Secondary);

                low = new ButtonBuilder()
                    .setCustomId("low")
                    .setEmoji("⬇️")
                    .setStyle(Secondary);

                skipHilo = new ButtonBuilder()
                    .setCustomId("skip")
                    .setEmoji("💰")
                    .setStyle(Secondary);
            } else {
                high = new ButtonBuilder()
                    .setCustomId("high")
                    .setLabel("Higher")
                    .setStyle(Success);

                low = new ButtonBuilder()
                    .setCustomId("low")
                    .setLabel("Lower")
                    .setStyle(Danger);

                skipHilo = new ButtonBuilder()
                    .setCustomId("skip")
                    .setLabel("Cash Out")
                    .setStyle(Primary);
            }

            return { high, low, skip: skipHilo };

        case "reveal":
            let revealBtn;
            if (buttonStyle === "classic") {
                revealBtn = new ButtonBuilder()
                    .setCustomId("reveal")
                    .setEmoji("✨")
                    .setStyle(Secondary);
            } else {
                revealBtn = new ButtonBuilder()
                    .setCustomId("reveal")
                    .setEmoji("🐉")
                    .setLabel("Reveal Your Destiny!")
                    .setStyle(Success);
            }
            return { reveal: revealBtn };

default:
    throw new Error(`getButtons: Unknown button type "${type}"`);
    }
}

module.exports = getButtons;
