"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const { InfoMessage, ErrorMessage } = require("../classes/classes.js");
const carNameGen = require("./carNameGen.js");
const sortCars = require("./sortCars.js");

// Preload all cars at module load time
const carsMap = new Map();
for (const file of carFiles) {
  carsMap.set(file, require(`../../cars/${file}`));
}

async function openPack(args) {
  const { message, currentPack, currentMessage, test } = args;
  const cardFilter = currentPack["filter"];
  let pulledCards = "";
  let addedCars = [];

  // Filter the cars once based on filterCard, using preloaded carsMap
  const filteredCars = carFiles.filter(file => {
    const car = carsMap.get(file);
    return filterCard(car, cardFilter);
  });

  // Validate filtered pool
  if (filteredCars.length === 0) {
    const errorMessage = new ErrorMessage({
      channel: message.channel,
      title: "Error: No cars available in the filtered pool.",
      desc: "Adjust your filter or choose a different pack.",
      author: message.author,
    });
    return errorMessage.sendMessage({ currentMessage });
  }

  if (filteredCars.length < currentPack["repetition"] * 5) {
    const errorMessage = new ErrorMessage({
      channel: message.channel,
      title: "Error: Insufficient cars in the filtered pool for this pack.",
      desc: "Consider reducing repetitions or adjusting the filter.",
      author: message.author,
    });
    return errorMessage.sendMessage({ currentMessage });
  }

  // Pre-group filtered cars by CR ranges for each rarity level to speed up picks
  const carsByCRRange = {
    standard: [],
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    exotic: [],
    legendary: [],
    mystic: [],
  };

  for (const file of filteredCars) {
    const car = carsMap.get(file);
    const cr = car.cr;

    if (cr >= 1 && cr <= 99) carsByCRRange.standard.push(file);
    else if (cr >= 100 && cr <= 249) carsByCRRange.common.push(file);
    else if (cr >= 250 && cr <= 399) carsByCRRange.uncommon.push(file);
    else if (cr >= 400 && cr <= 549) carsByCRRange.rare.push(file);
    else if (cr >= 550 && cr <= 699) carsByCRRange.epic.push(file);
    else if (cr >= 700 && cr <= 849) carsByCRRange.exotic.push(file);
    else if (cr >= 850 && cr <= 999) carsByCRRange.legendary.push(file);
    else if (cr >= 1000) carsByCRRange.mystic.push(file);
  }

  // Helper to pick a random car from the correct CR group for given rarity
  function pickRandomCar(rarity) {
    const pool = carsByCRRange[rarity];
    if (!pool || pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  for (let i = 0; i < currentPack["repetition"] * 5; i++) {
    let rand = Math.floor(Math.random() * 1000) / 10;
    let check = 0;
    let chosenRarity = null;

    // Determine rarity based on packSequence for this card slot
    const packIndex = Math.floor(i / currentPack["repetition"]);
    for (const rarity of Object.keys(currentPack["packSequence"][packIndex])) {
      check += currentPack["packSequence"][packIndex][rarity];
      if (check > rand) {
        chosenRarity = rarity;
        break;
      }
    }

    if (!chosenRarity) {
      // Fallback to 'standard' rarity if something goes wrong
      chosenRarity = "standard";
    }

    // Pick a random car for this rarity
    const carFile = pickRandomCar(chosenRarity);
    if (!carFile) {
      const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error: No cars matching criteria within the filtered pool.",
        desc: "Consider adjusting the filter or pack settings.",
        author: message.author,
      });
      return errorMessage.sendMessage({ currentMessage });
    }

    addedCars.push({ carID: carFile.slice(0, 6), upgrade: "000" });
  }

  // Sort the pulled cars by CR ascending
  addedCars = sortCars(addedCars, "cr", "ascending");

  // Build and send embed messages in batches of 5 cards
  for (let i = 0; i < addedCars.length; i++) {
    const currentCar = carsMap.get(`${addedCars[i].carID}.json`);
    pulledCards += carNameGen({ currentCar, rarity: true });

    if ((i + 1) % 5 !== 0) {
      pulledCards += ` **[[Card]](${currentCar["racehud"]})**\n`;
    } else {
      const packScreen = new InfoMessage({
        channel: message.channel,
        title: `Opening ${currentPack["packName"]}...`,
        desc: "Click on the image to see the cards better.",
        author: message.author,
        image: currentCar["racehud"],
        thumbnail: currentPack["pack"],
        fields: [{ name: "Cards Pulled", value: pulledCards }],
        footer: test
          ? "This is a test pack, meaning that these cars won't be added into your garage and you won't be charged with money."
          : null,
      });
      await packScreen.sendMessage({
        currentMessage: i === 4 ? currentMessage : null,
        preserve: true,
      });
      pulledCards = "";
    }
  }

  return addedCars;

  // Filter helper with car object and filter object
  function filterCard(currentCard, filter) {
    if (currentCard["reference"] || currentCard["isPrize"] === true) return false;
    let passed = true;

    for (let criteria in filter) {
      if (filter[criteria] !== "None") {
        switch (criteria) {
          case "make":
          case "tags":
          case "creator":
          case "bodyStyle":
          case "hiddenTag":
            if (Array.isArray(currentCard[criteria])) {
              if (
                currentCard[criteria].some(
                  (m) => m && m.toLowerCase() === filter[criteria].toLowerCase()
                ) === false
              )
                passed = false;
            } else if (
              currentCard[criteria] &&
              currentCard[criteria].toLowerCase() !== filter[criteria].toLowerCase()
            ) {
              passed = false;
            }
            break;
          case "modelYear":
          case "seatCount":
            if (
              !currentCard[criteria] ||
              currentCard[criteria] < filter[criteria]["start"] ||
              currentCard[criteria] > filter[criteria]["end"]
            ) {
              passed = false;
            }
            break;
          default:
            if (
              currentCard[criteria] &&
              typeof currentCard[criteria] === "string" &&
              filter[criteria] &&
              typeof filter[criteria] === "string" &&
              currentCard[criteria].toLowerCase() !== filter[criteria].toLowerCase()
            ) {
              passed = false;
            }
            break;
        }
      }
    }
    return passed;
  }
}

module.exports = openPack;
