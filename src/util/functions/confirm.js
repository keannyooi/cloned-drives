"use strict";

const { ActionRowBuilder, ComponentType: { Button } } = require("discord.js");
const { defaultChoiceTime } = require("../consts/consts.js");
const getButtons = require("./getButtons.js");

/**
 * Yes/No confirmation dialog.
 *
 * Returns a Promise that resolves only after the dialog is DECIDED (clicked or
 * timed out). Every caller awaits this, so the per-user command lock is held
 * for the dialog's whole lifetime — a pending confirmation can no longer
 * outlive its command and later clobber the profile with a stale snapshot
 * (the old behavior attached the collector and returned immediately).
 *
 * The collector is scoped to the confirmation MESSAGE, not the channel: two
 * pending dialogs can no longer both fire from a single yse/nop click.
 */
async function confirm(message, confirmationMessage, acceptedFunction, buttonStyle, currentMessage) {
    const filter = (button) => button.user.id === message.author.id;
    const { yse, nop } = getButtons("choice", buttonStyle);
    const row = new ActionRowBuilder().addComponents(yse, nop);
    const reactionMessage = await confirmationMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });
    if (!reactionMessage) return;

    return new Promise((resolve, reject) => {
        let processed = false;
        let failure = null;
        // Accumulates in-flight click handling so the end-handler NEVER
        // resolves while acceptedFunction is still mid-write — a collector
        // timeout firing during a slow accepted callback must not release
        // the caller's command lock early or swallow the callback's errors.
        let inFlight = Promise.resolve();

        const collector = reactionMessage.message.createMessageComponentCollector({ filter, time: defaultChoiceTime, componentType: Button });
        collector.on("collect", (button) => {
            if (processed) return;
            processed = true;
            const handled = (async () => {
                switch (button.customId) {
                    case "yse":
                        await acceptedFunction(reactionMessage);
                        break;
                    case "nop":
                        confirmationMessage.editEmbed({ title: "Action cancelled." });
                        await confirmationMessage.sendMessage({ currentMessage: reactionMessage, preserve: true });
                        await confirmationMessage.removeButtons();
                        break;
                    default:
                        processed = false;
                        return;
                }
            })();
            inFlight = inFlight.then(() => handled, () => handled);
            handled.then(
                () => { if (processed) collector.stop(); },
                (error) => { failure = failure || error; collector.stop(); }
            );
        });

        collector.on("end", async () => {
            await inFlight.catch(() => {});
            if (failure) return reject(failure);
            if (!processed) {
                processed = true;
                try {
                    confirmationMessage.editEmbed({
                        title: "Action cancelled automatically.",
                        desc: `I can only wait for you for ${defaultChoiceTime / 1000} seconds. Please act quicker next time.`
                    });
                    await confirmationMessage.sendMessage({ currentMessage: reactionMessage, preserve: true });
                    await confirmationMessage.removeButtons();
                } catch (_) { /* cosmetic cleanup only */ }
            }
            resolve();
        });
    });
}

module.exports = confirm;
