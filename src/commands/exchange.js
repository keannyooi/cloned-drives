"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultWaitTime, defaultChoiceTime, trophyEmojiID } = require("../util/consts/consts.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const addCars = require("../util/functions/addCars.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "exchange",
    aliases: ["ex", "prizeexchange"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Exchange a duplicate prize car for another prize car you don't own (within 50 CR).",
    async execute(message, args) {
        const playerData = await profileModel.findOne({ userID: message.author.id });
        const carFiles = getCarFiles();

        // Step 1: Find all duplicate prize cars (prize cars where player owns more than 1)
        const duplicatePrizeCars = [];
        for (const garageCar of playerData.garage) {
            const carData = getCar(garageCar.carID);
            if (carData.isPrize === true && !carData.reference) {
                const totalOwned = calcTotal(garageCar);
                if (totalOwned > 1) {
                    duplicatePrizeCars.push({
                        garageCar,
                        carData,
                        totalOwned
                    });
                }
            }
        }

        // Step 2: Check if player has any duplicate prize cars
        if (duplicatePrizeCars.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, you do not own any duplicate prize cars.",
                desc: "You need to own more than one of a prize car to exchange it.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Step 3: Create dropdown with duplicate prize cars
        const options = duplicatePrizeCars.map((item, index) => ({
            label: `${carNameGen({ currentCar: item.carData, removePrizeTag: true })} (x${item.totalOwned})`,
            description: `CR: ${item.carData.cr}`,
            value: `${index}`,
            emoji: `<trophies:${trophyEmojiID}>`
        }));

        const dropdownList = new StringSelectMenuBuilder()
            .setCustomId("exchangeSelect")
            .setPlaceholder("Select a duplicate prize car to exchange...")
            .addOptions(...options);
        const row = new ActionRowBuilder().addComponents(dropdownList);

        const selectMessage = new InfoMessage({
            channel: message.channel,
            title: "Prize Car Exchange",
            desc: "Select a duplicate prize car you want to exchange.",
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to select.`
        });
        let currentMessage = await selectMessage.sendMessage({ buttons: [row], preserve: true });

        // Step 4: Wait for selection
        const filter = (interaction) => interaction.user.id === message.author.id && interaction.customId === "exchangeSelect";
        
        try {
            const selection = await message.channel.awaitMessageComponent({
                filter,
                time: defaultWaitTime
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();

            const selectedIndex = parseInt(selection.values[0]);
            const selectedDuplicate = duplicatePrizeCars[selectedIndex];
            const selectedCarData = selectedDuplicate.carData;
            const selectedGarageCar = selectedDuplicate.garageCar;

            // Step 5: Ask player to type desired prize car
            const typeMessage = new InfoMessage({
                channel: message.channel,
                title: "Type out the prize car you want",
                desc: `You selected: **${carNameGen({ currentCar: selectedCarData, rarity: true })}**\n\nNow type the name of the prize car you want to receive.\nIt must be within ±50 CR of your selected car (CR ${selectedCarData.cr - 50} to ${selectedCarData.cr + 50}).`,
                author: message.author,
                image: selectedCarData.racehud,
                footer: `You have been given ${defaultWaitTime / 1000} seconds to respond.`
            });
            currentMessage = await typeMessage.sendMessage({ currentMessage });

            // Step 6: Wait for player to type car name
            const messageFilter = (m) => m.author.id === message.author.id;
            
            try {
                const collected = await message.channel.awaitMessages({
                    filter: messageFilter,
                    max: 1,
                    time: defaultWaitTime,
                    errors: ["time"]
                });

                const userInput = collected.first().content.toLowerCase().split(" ");
                
                // Try to delete the user's message to keep chat clean
                try {
                    await collected.first().delete();
                } catch (e) {
                    // Ignore if we can't delete
                }

                // Step 7: Search for the prize car they want
                // Filter car files to only include prize cars within CR range
                const validPrizeCars = carFiles.filter(file => {
                    const carId = file.endsWith('.json') ? file.slice(0, -5) : file;
                    const car = getCar(carId);
                    if (!car || car.isPrize !== true || car.reference) return false;
                    const crDiff = Math.abs(car.cr - selectedCarData.cr);
                    return crDiff <= 50;
                });

                if (validPrizeCars.length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, no valid prize cars found.",
                        desc: "There are no other prize cars within the CR range to exchange for.",
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                // Search for the car
                await new Promise(resolve => resolve(search(message, userInput, validPrizeCars, "car", currentMessage)))
                    .then(async (response) => {
                        if (!Array.isArray(response)) return;
                        let [carFile, currentMessage2] = response;
                        currentMessage = currentMessage2;

                        const desiredCarID = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
                        const desiredCar = getCar(desiredCarID);

                        // Step 8: Check if player already owns the desired car
                        const alreadyOwns = playerData.garage.find(c => c.carID === desiredCarID.slice(0, 6));
                        if (alreadyOwns && calcTotal(alreadyOwns) > 0) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Sorry, you can't trade for a prize car you already own!",
                                desc: `You already own the ${carNameGen({ currentCar: desiredCar, rarity: true })}.`,
                                author: message.author,
                                image: desiredCar.racehud
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 9: Check if it's the same car
                        if (desiredCarID.slice(0, 6) === selectedGarageCar.carID) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, you can't exchange a car for itself!",
                                desc: "Please choose a different prize car.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 10: Double-check CR range (should already be filtered but just in case)
                        const crDiff = Math.abs(desiredCar.cr - selectedCarData.cr);
                        if (crDiff > 50) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, prize car is not within CR range!",
                                desc: `The selected car must be within ±50 CR of your duplicate.\nYour car: CR ${selectedCarData.cr}\nDesired car: CR ${desiredCar.cr}\nDifference: ${crDiff} CR (max: 50)`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 11: Confirmation
                        const confirmationMessage = new InfoMessage({
                            channel: message.channel,
                            title: "Confirm Prize Car Exchange",
                            desc: `Are you sure you want to exchange:\n\n**Giving:** ${carNameGen({ currentCar: selectedCarData, rarity: true })}\n**Receiving:** ${carNameGen({ currentCar: desiredCar, rarity: true })}`,
                            author: message.author,
                            image: desiredCar.racehud,
                            footer: `You have ${defaultChoiceTime / 1000} seconds to confirm.`
                        });

                        await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                        async function acceptedFunction(currentMessage) {
                            // Find the upgrade to remove (prefer stock, then lowest upgrade)
                            let upgradeToRemove = null;
                            const upgradeOrder = ["000", "333", "666", "699", "969", "996"];
                            for (const upg of upgradeOrder) {
                                if (selectedGarageCar.upgrades[upg] > 0) {
                                    upgradeToRemove = upg;
                                    break;
                                }
                            }

                            if (!upgradeToRemove) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, could not find a car to remove.",
                                    desc: "Something went wrong. Please try again.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            // Remove one of the duplicate prize cars
                            updateHands(playerData, selectedGarageCar.carID, upgradeToRemove, "remove");
                            selectedGarageCar.upgrades[upgradeToRemove] -= 1;
                            
                            // If no more of this car, remove from garage
                            if (calcTotal(selectedGarageCar) === 0) {
                                playerData.garage.splice(playerData.garage.indexOf(selectedGarageCar), 1);
                            }

                            // Add the new prize car (stock upgrade)
                            playerData.garage = addCars(playerData.garage, [{ carID: desiredCarID.slice(0, 6), upgrade: "000" }]);

                            // Save to database
                            await profileModel.updateOne({ userID: message.author.id }, {
                                garage: playerData.garage,
                                hand: playerData.hand,
                                decks: playerData.decks
                            });

                            // Success message
                            const successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: "🎉 Congratulations! Exchange Successful!",
                                desc: `You exchanged your ${carNameGen({ currentCar: selectedCarData, rarity: true })} for a brand new ${carNameGen({ currentCar: desiredCar, rarity: true })}!`,
                                author: message.author,
                                image: desiredCar.racehud
                            });
                            await successMessage.sendMessage({ currentMessage });
                            return successMessage.removeButtons();
                        }
                    })
                    .catch(error => {
                        throw error;
                    });

            } catch (timeError) {
                const cancelMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Action cancelled automatically.",
                    desc: `You didn't type a car name in time. Please try again.`,
                    author: message.author
                });
                return cancelMessage.sendMessage({ currentMessage });
            }

        } catch (error) {
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `You didn't select a car in time. Please try again.`,
                author: message.author
            });
            await cancelMessage.sendMessage({ currentMessage });
            return currentMessage.removeButtons();
        }
    }
};
