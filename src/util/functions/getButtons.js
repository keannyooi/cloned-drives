"use strict";

const { MessageButton } = require("discord.js");

function getButtons(type, buttonStyle) {
    switch (type) {
        case "menu":
            let firstPage, prevPage, nextPage, lastPage;
            if (buttonStyle === "classic") {
                firstPage = new MessageButton({
                    emoji: "⏪",
                    style: "SECONDARY",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    emoji: "⬅️",
                    style: "SECONDARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    emoji: "➡️",
                    style: "SECONDARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    emoji: "⏩",
                    style: "SECONDARY",
                    customId: "last_page"
                });
            }
            else {
                firstPage = new MessageButton({
                    label: "<<",
                    style: "DANGER",
                    customId: "first_page"
                });
                prevPage = new MessageButton({
                    label: "<",
                    style: "PRIMARY",
                    customId: "prev_page"
                });
                nextPage = new MessageButton({
                    label: ">",
                    style: "PRIMARY",
                    customId: "next_page"
                });
                lastPage = new MessageButton({
                    label: ">>",
                    style: "DANGER",
                    customId: "last_page"
                });
            }
            return { firstPage, prevPage, nextPage, lastPage };
        case "choice":
        case "rr":
            let yse, nop, skip;
            if (buttonStyle === "classic") {
                yse = new MessageButton({
                    emoji: "✅",
                    style: "SECONDARY",
                    customId: "yse"
                });
                nop = new MessageButton({
                    emoji: "❎",
                    style: "SECONDARY",
                    customId: "nop"
                });
                if (type === "rr") {
                    skip = new MessageButton({
                        emoji: "⏩",
                        style: "SECONDARY",
                        customId: "skip"
                    });
                }
            }
            else {
                yse = new MessageButton({
                    label: "YES, DO IT!",
                    style: "SUCCESS",
                    customId: "yse"
                });
                nop = new MessageButton({
                    label: "No, I'm not ready!",
                    style: "DANGER",
                    customId: "nop"
                });
                if (type === "rr") {
                    skip = new MessageButton({
                        label: "I give up. (Skips and resets streak)",
                        style: "PRIMARY",
                        customId: "skip"
                    });
                }
            }
            return { yse, nop, skip };
        default:
            return;
    }
}

module.exports = getButtons;