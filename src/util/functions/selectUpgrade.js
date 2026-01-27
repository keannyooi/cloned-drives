"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { ErrorMessage, InfoMessage } = require("../classes/classes.js");
const { defaultWaitTime } = require("../consts/consts.js");
const { getCar } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");

async function selectUpgrade(args) {
    let { message, currentCar, amount, currentMessage, targetUpgrade } = args;
    const filter = (button) => button.user.id === message.author.id && button.customId === "upgradeSelect";
    const getCard = getCar(currentCar.carID);
    let isOne = Object.keys(currentCar.upgrades).filter(upgrade => {
        if (targetUpgrade && (upgrade.includes("6") && upgrade.includes("9") || Number(targetUpgrade) <= Number(upgrade))) {
            return false;
        }
        return currentCar.upgrades[upgrade] >= amount;
    });

    if (isOne.length === 1) {
        return [isOne[0], currentMessage];
    }
    else if (isOne.length > 1) {
        const options = [];
        for (let upg of isOne) {
            options.push({
                label: upg === "000" ? "Stock upgrade" : `${upg} upgrade`,
                value: upg
            });
        }
        const dropdownList = new StringSelectMenuBuilder()
            .setCustomId("upgradeSelect")
            .setPlaceholder("Select a tune...")
            .addOptions(...options);
        const row = new ActionRowBuilder().addComponents(dropdownList);

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: `Choose one of the ${isOne.length} available tunes below.`,
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to consider.`,
            fields: [{ name: "Selected Car", value: carNameGen({ currentCar: getCard, rarity: true }) }],
            image: getCard["racehud"]
        });
        currentMessage = await infoMessage.sendMessage({ currentMessage, buttons: [row], preserve: true });

        try {
            const selection = await message.channel.awaitMessageComponent({
                filter,
                max: 1,
                time: defaultWaitTime,
                errors: ["time"]
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();
            return [selection.values[0], currentMessage];
        }
        catch (error) {
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `I can only wait for your response for ${defaultWaitTime / 1000} seconds. Please act quicker next time.`,
                author: message.author
            });
            await cancelMessage.sendMessage({ currentMessage });
            return cancelMessage.removeButtons();
        }
    }
    else {
        const cancelMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, no compatible upgrades found for target upgrade.",
            desc: "Correct tuning order: `000` => `333` => `666` => `996`, `969` or `699`.",
            author: message.author
        }).displayClosest(targetUpgrade);
        return cancelMessage.sendMessage({ currentMessage });
    }
}

module.exports = selectUpgrade;
