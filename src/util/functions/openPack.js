"use strict";

const { ActionRowBuilder, ComponentType: { Button } } = require("discord.js");
const { getCarFiles, getCar } = require("./dataManager.js");
const { InfoMessage, ErrorMessage } = require("../classes/classes.js");
const carNameGen = require("./carNameGen.js");
const sortCars = require("./sortCars.js");
const getButtons = require("./getButtons.js");

// NEW indicator emoji
const NEW_EMOJI = "✨";

// Jackpot reveal timeout (ms)
const JACKPOT_REVEAL_TIME = 15000;

/**
 * Opens a pack and returns the array of pulled cars.
 *
 * Supports all legacy pack formats plus:
 *   - Variable card counts (packSequence can have any number of slots)
 *   - OR/AND filter logic via `filterLogic`
 *   - Per-slot filters via { rates: {...}, filter: {...} } slot format
 *   - `pool` entries in slots for specific car picks
 *   - `upgradeChance` for pre-upgraded pulls
 *   - `noDuplicates` prevents same carID in one opening
 *   - `cardsPerPage` for flexible display batching
 *   - NEW indicator via `discoveredCars`
 *   - Jackpot reveal for NEW mystic cards
 *
 * @param {Object} args
 * @param {Object}  args.message        - Discord message object
 * @param {Object}  args.currentPack    - Pack definition object
 * @param {Object}  [args.currentMessage] - Existing message to edit for first page
 * @param {boolean} [args.test]         - Test mode (display only, no garage changes)
 * @param {Array}   [args.discoveredCars] - Player's discovered carIDs (mutated in-place)
 * @param {string}  [args.buttonStyle]  - User's button style preference
 * @returns {Array|undefined} Array of { carID, upgrade } on success, undefined on error
 */
async function openPack(args) {
  const { message, currentPack, currentMessage, test, discoveredCars, buttonStyle } = args;
  const carFiles = getCarFiles();

  // === Pack configuration (all optional, with backward-compatible defaults) ===
  const cardsPerPage = currentPack.cardsPerPage || 5;
  const filterLogic = currentPack.filterLogic || "and";
  const packFilter = currentPack.filter || {};
  const noDupes = currentPack.noDuplicates || false;
  const repetition = currentPack.repetition || 1;

  // === Build the flat slot list ===
  const slots = [];
  for (let i = 0; i < currentPack.packSequence.length; i++) {
    const slotDef = currentPack.packSequence[i];
    let rates, slotFilter;

    if (slotDef.rates) {
      rates = slotDef.rates;
      slotFilter = slotDef.filter
        ? mergeFilters(packFilter, slotDef.filter)
        : packFilter;
    } else {
      rates = { ...slotDef };
      slotFilter = packFilter;
    }

    for (let r = 0; r < repetition; r++) {
      slots.push({ rates, filter: slotFilter });
    }
  }

  const totalCards = slots.length;

  // === Filtered pool cache ===
  const filterCache = new Map();

  function getFilteredPool(filter) {
    const key = JSON.stringify(filter);
    if (filterCache.has(key)) return filterCache.get(key);

    const filtered = carFiles.filter((file) => {
      const car = getCar(file);
      return filterCard(car, filter, filterLogic);
    });

    const byRarity = {
      standard: [],
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      exotic: [],
      legendary: [],
      mystic: [],
    };

    for (const file of filtered) {
      const car = getCar(file);
      const cr = car.cr;
      if (cr >= 1 && cr <= 99) byRarity.standard.push(file);
      else if (cr >= 100 && cr <= 249) byRarity.common.push(file);
      else if (cr >= 250 && cr <= 399) byRarity.uncommon.push(file);
      else if (cr >= 400 && cr <= 549) byRarity.rare.push(file);
      else if (cr >= 550 && cr <= 699) byRarity.epic.push(file);
      else if (cr >= 700 && cr <= 849) byRarity.exotic.push(file);
      else if (cr >= 850 && cr <= 999) byRarity.legendary.push(file);
      else if (cr >= 1000) byRarity.mystic.push(file);
    }

    const result = { filtered, byRarity };
    filterCache.set(key, result);
    return result;
  }

  // === Validate filtered pool ===
  const { filtered: mainFiltered } = getFilteredPool(packFilter);
  if (mainFiltered.length === 0) {
    const errorMessage = new ErrorMessage({
      channel: message.channel,
      title: "Error: No cars available in the filtered pool.",
      desc: "Adjust your filter or choose a different pack.",
      author: message.author,
    });
    return errorMessage.sendMessage({ currentMessage });
  }

  if (mainFiltered.length < totalCards && !hasAnyPool(slots)) {
    const errorMessage = new ErrorMessage({
      channel: message.channel,
      title: "Error: Insufficient cars in the filtered pool for this pack.",
      desc: "Consider reducing repetitions or adjusting the filter.",
      author: message.author,
    });
    return errorMessage.sendMessage({ currentMessage });
  }

  // === Roll cards ===
  let addedCars = [];
  const pulledCarIDs = new Set();

  for (let i = 0; i < totalCards; i++) {
    const { rates, filter } = slots[i];

    let rand = Math.floor(Math.random() * 1000) / 10;
    let check = 0;
    let chosenCarID = null;
    let chosenUpgrade = "000";
    let fromPool = false;

    for (const key of Object.keys(rates)) {
      if (key === "pool") {
        for (const entry of rates.pool) {
          check += entry.weight;
          if (check > rand) {
            chosenCarID = entry.carID;
            chosenUpgrade = entry.upgrade || "000";
            fromPool = true;
            break;
          }
        }
        if (chosenCarID) break;
      } else {
        check += rates[key];
        if (check > rand) {
          const { byRarity } = getFilteredPool(filter);
          chosenCarID = pickRandomCar(byRarity[key], pulledCarIDs, noDupes);
          break;
        }
      }
    }

    if (!chosenCarID) {
      const { byRarity } = getFilteredPool(filter);
      chosenCarID = pickRandomCar(byRarity.standard, pulledCarIDs, noDupes);
    }

    if (!chosenCarID) {
      const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error: No cars matching criteria within the filtered pool.",
        desc: "Consider adjusting the filter or pack settings.",
        author: message.author,
      });
      return errorMessage.sendMessage({ currentMessage });
    }

    if (!fromPool && chosenUpgrade === "000" && currentPack.upgradeChance) {
      const upgradeRoll = Math.random() * 100;
      let upgradeCheck = 0;
      for (const [upg, chance] of Object.entries(currentPack.upgradeChance)) {
        upgradeCheck += chance;
        if (upgradeRoll < upgradeCheck) {
          chosenUpgrade = upg;
          break;
        }
      }
    }

    const carID = chosenCarID.slice(0, 6);
    addedCars.push({ carID, upgrade: chosenUpgrade });
    pulledCarIDs.add(carID);
  }

  // Sort pulled cards by CR ascending (best card last)
  addedCars = sortCars(addedCars, "cr", "ascending");

  // === Pre-calculate NEW status for all cards BEFORE display ===
  // (So we know which are new before we start adding them to discoveredCars)
  const newStatus = addedCars.map((car) => {
    return discoveredCars && !discoveredCars.includes(car.carID);
  });

  // === Display pulled cards ===
  let pulledCards = "";
  let isFirstPage = true;

  for (let i = 0; i < addedCars.length; i++) {
    const currentCar = getCar(addedCars[i].carID);
    const isNew = newStatus[i];
    const isMystic = currentCar.cr >= 1000;
    const isLastOnPage = (i + 1) % cardsPerPage === 0;
    const isLastCard = i === addedCars.length - 1;
    const isFeaturedCard = isLastOnPage || isLastCard;

    // Track discovery (do this regardless of display path)
    if (isNew && discoveredCars) {
      discoveredCars.push(addedCars[i].carID);
    }

    // === JACKPOT REVEAL: NEW Mystic on a featured slot ===
    if (isNew && isMystic && isFeaturedCard) {
      // First, display any cards accumulated before this one on the same page
      if (pulledCards.length > 0) {
        // Show the teaser with previous cards listed but the mystic hidden
        pulledCards += `??? ${NEW_EMOJI} **[SOMETHING SPECIAL]**`;
        if (addedCars[i].upgrade !== "000") {
          pulledCards += ` ⬆️ **(${addedCars[i].upgrade})**`;
        }

        const teaserEmbed = new InfoMessage({
          channel: message.channel,
          title: `Opening ${currentPack["packName"]}...`,
          desc: "✨ **You feel a surge of energy...** ✨\n\n*Something extraordinary is hiding in this pack!*",
          author: message.author,
          thumbnail: currentPack["pack"],
          fields: [{ name: "Cards Pulled", value: pulledCards }],
          footer: test
            ? "This is a test pack — cars won't be added to your garage."
            : "Press the button to reveal your destiny!",
        });

        const { reveal } = getButtons("reveal", buttonStyle);
        const row = new ActionRowBuilder().addComponents(reveal);

        const teaserMessage = await teaserEmbed.sendMessage({
          currentMessage: isFirstPage ? currentMessage : null,
          buttons: [row],
          preserve: true,
        });
        isFirstPage = false;

        // Wait for reveal button or timeout
        await waitForReveal(message, teaserMessage, JACKPOT_REVEAL_TIME);

        // Now show the actual card - rebuild pulledCards from scratch for this page
        pulledCards = "";
        // Re-add the previous cards on this page
        const pageStart = Math.floor(i / cardsPerPage) * cardsPerPage;
        for (let j = pageStart; j < i; j++) {
          const prevCar = getCar(addedCars[j].carID);
          pulledCards += carNameGen({ currentCar: prevCar, rarity: true });
          if (newStatus[j]) {
            pulledCards += ` ${NEW_EMOJI}`;
          }
          if (addedCars[j].upgrade !== "000") {
            pulledCards += ` ⬆️ **(${addedCars[j].upgrade})**`;
          }
          pulledCards += ` **[[Card]](${prevCar["racehud"]})**\n`;
        }
        // Add the mystic card
        pulledCards += carNameGen({ currentCar, rarity: true }) + ` ${NEW_EMOJI}`;
        if (addedCars[i].upgrade !== "000") {
          pulledCards += ` ⬆️ **(${addedCars[i].upgrade})**`;
        }
      } else {
        // Mystic is the only/first card on this page — full dramatic reveal
        const teaserEmbed = new InfoMessage({
          channel: message.channel,
          title: `Opening ${currentPack["packName"]}...`,
          desc: "🌟 **The pack trembles with power...** 🌟\n\n*An ancient force stirs within. A card of mythical rarity awaits!*",
          author: message.author,
          image: currentPack["pack"],
          thumbnail: currentPack["pack"],
          footer: test
            ? "This is a test pack — cars won't be added to your garage."
            : "Press the button to reveal your destiny!",
        });

        const { reveal } = getButtons("reveal", buttonStyle);
        const row = new ActionRowBuilder().addComponents(reveal);

        const teaserMessage = await teaserEmbed.sendMessage({
          currentMessage: isFirstPage ? currentMessage : null,
          buttons: [row],
          preserve: true,
        });
        isFirstPage = false;

        // Wait for reveal button or timeout
        await waitForReveal(message, teaserMessage, JACKPOT_REVEAL_TIME);

        // Build the reveal string
        pulledCards = carNameGen({ currentCar, rarity: true }) + ` ${NEW_EMOJI}`;
        if (addedCars[i].upgrade !== "000") {
          pulledCards += ` ⬆️ **(${addedCars[i].upgrade})**`;
        }
      }

      // Now show the full reveal
      const revealEmbed = new InfoMessage({
        channel: message.channel,
        title: `🎉 JACKPOT! 🎉`,
        desc: "✨ **A NEW MYSTIC CARD!** ✨",
        author: message.author,
        image: currentCar["racehud"],
        thumbnail: currentPack["pack"],
        fields: [{ name: "Cards Pulled", value: pulledCards }],
        footer: test
          ? "This is a test pack — cars won't be added to your garage."
          : "Congratulations on this incredible pull!",
      });
      await revealEmbed.sendMessage({ preserve: true });
      pulledCards = "";
    }
    // === NORMAL DISPLAY ===
    else {
      pulledCards += carNameGen({ currentCar, rarity: true });

      if (isNew) {
        pulledCards += ` ${NEW_EMOJI}`;
      }

      if (addedCars[i].upgrade !== "000") {
        pulledCards += ` ⬆️ **(${addedCars[i].upgrade})**`;
      }

      if (!isFeaturedCard) {
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
            ? "This is a test pack — cars won't be added to your garage."
            : null,
        });
        await packScreen.sendMessage({
          currentMessage: isFirstPage ? currentMessage : null,
          preserve: true,
        });
        isFirstPage = false;
        pulledCards = "";
      }
    }
  }

  return addedCars;
}

// ============================================================
//  Helper functions
// ============================================================

/**
 * Waits for the user to click the reveal button, or times out.
 * Either way, removes the buttons afterward.
 */
async function waitForReveal(message, teaserMessage, timeout) {
  return new Promise((resolve) => {
    const filter = (button) => button.user.id === message.author.id && button.customId === "reveal";
    const collector = message.channel.createMessageComponentCollector({
      filter,
      time: timeout,
      componentType: Button,
      max: 1,
    });

    collector.on("collect", async (button) => {
      try {
        await button.deferUpdate();
      } catch (e) {
        // Ignore if already deferred
      }
      collector.stop("revealed");
    });

    collector.on("end", async () => {
      try {
        await teaserMessage.removeButtons();
      } catch (e) {
        // Ignore if message was deleted
      }
      resolve();
    });
  });
}

/** Shallow-merge two filter objects (override takes precedence). */
function mergeFilters(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = value;
  }
  return merged;
}

/** Check whether any slot in the list uses a pool. */
function hasAnyPool(slots) {
  return slots.some((s) => s.rates.pool && s.rates.pool.length > 0);
}

/**
 * Pick a random car from a rarity pool.
 * Respects noDuplicates by preferring cars not already pulled.
 */
function pickRandomCar(pool, pulledIDs, noDuplicates) {
  if (!pool || pool.length === 0) return null;

  if (noDuplicates && pulledIDs.size > 0) {
    const available = pool.filter((f) => !pulledIDs.has(f.slice(0, 6)));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Determines whether a car passes the pack's filter.
 */
function filterCard(currentCard, filter, filterLogic) {
  if (currentCard["reference"] || currentCard["isPrize"] === true) return false;

  const useOrLogic = filterLogic === "or";

  for (const criteria in filter) {
    const filterVal = filter[criteria];
    if (filterVal === "None") continue;

    const cardVal = currentCard[criteria];

    if (Array.isArray(filterVal)) {
      let cardArray = Array.isArray(cardVal)
        ? cardVal
        : cardVal
        ? [cardVal]
        : [];
      cardArray = cardArray.map((v) =>
        typeof v === "string" ? v.toLowerCase() : v
      );
      const filterArray = filterVal.map((v) =>
        typeof v === "string" ? v.toLowerCase() : v
      );

      if (useOrLogic) {
        if (!filterArray.some((fv) => cardArray.includes(fv))) return false;
      } else {
        if (!filterArray.every((fv) => cardArray.includes(fv))) return false;
      }
    } else if (
      typeof filterVal === "object" &&
      filterVal !== null &&
      "start" in filterVal &&
      "end" in filterVal
    ) {
      if (cardVal == null || cardVal < filterVal.start || cardVal > filterVal.end)
        return false;
    } else if (typeof filterVal === "string") {
      if (Array.isArray(cardVal)) {
        if (
          !cardVal.some(
            (v) =>
              typeof v === "string" &&
              v.toLowerCase() === filterVal.toLowerCase()
          )
        )
          return false;
      } else if (typeof cardVal === "string") {
        if (cardVal.toLowerCase() !== filterVal.toLowerCase()) return false;
      } else {
        return false;
      }
    } else if (typeof filterVal === "boolean") {
      if (cardVal !== filterVal) return false;
    }
  }
  return true;
}

module.exports = openPack;
