"use strict";

console.log("🔥 hilo.js loaded");

const bot = require("../config/config.js");
const { ActionRowBuilder } = require("discord.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, hiloChoiceTime, moneyEmojiID } = require("../util/consts/consts.js");
const getButtons = require("../util/functions/getButtons.js");
const carNameGen = require("../util/functions/carNameGen.js");
const { trackHiloGame, trackMoneyEarned } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

// 🎯 CR Range brackets for balanced gameplay
const CR_BRACKETS = [
  { min: 0, max: 99, label: "Standard Class" },
  { min: 100, max: 249, label: "Common Class" },
  { min: 250, max: 399, label: "Uncommon Class" },
  { min: 400, max: 549, label: "Rare Class" },
  { min: 550, max: 699, label: "Epic Class" },
  { min: 700, max: 849, label: "Exotic Class" },
  { min: 850, max: 999, label: "Legendary Class" },
  { min: 1000, max: 1500, label: "Mystic Class" }
];

module.exports = {
  name: "hilo",
  usage: [],
  args: 0,
  category: "Gameplay",
  description: "Guess whether the next car will be higher or lower in value.",

  async execute(message) {
    // Get car files inside execute() to ensure dataManager is initialized
    const carFiles = getCarFiles();
    
    const profile = await profileModel.findOne({ userID: message.author.id });
    if (!profile) return;

    // Helper functions defined inside execute() so they have access to carFiles
    function getCarCR(car) {
      if (car.reference) {
        const bmCar = getCar(car.reference);
        return bmCar ? bmCar.cr || 0 : 0;
      }
      return car.cr || 0;
    }

    function randomCar() {
      const file = carFiles[Math.floor(Math.random() * carFiles.length)];
      // Remove .json extension when calling getCar
      const carId = file.endsWith('.json') ? file.slice(0, -5) : file;
      return getCar(carId);
    }

    function randomCarInRange(minCR, maxCR) {
      const validCars = [];
      
      // Sample a subset to avoid checking all cars
      const sampleSize = Math.min(500, carFiles.length);
      const sampledFiles = [];
      
      for (let i = 0; i < sampleSize; i++) {
        const file = carFiles[Math.floor(Math.random() * carFiles.length)];
        if (!sampledFiles.includes(file)) {
          sampledFiles.push(file);
        }
      }
      
      for (const file of sampledFiles) {
        // Remove .json extension when calling getCar
        const carId = file.endsWith('.json') ? file.slice(0, -5) : file;
        const car = getCar(carId);
        if (!car) continue;
        const cr = getCarCR(car);
        
        if (cr >= minCR && cr <= maxCR) {
          validCars.push(car);
        }
      }
      
      // If no cars found in range, return random car
      if (validCars.length === 0) {
        return randomCar();
      }
      
      return validCars[Math.floor(Math.random() * validCars.length)];
    }

    function renderCar(car, streak, reward, multiplier, bonusRounds, bracket) {
      const carName = carNameGen({ currentCar: car, rarity: true });
      const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
      let bonusInfo = "";
      
      if (bonusRounds > 0) {
        bonusInfo = `\n✨ Bonus: **${multiplier}x** (${bonusRounds} round${bonusRounds > 1 ? 's' : ''} left)`;
      }
      
      return `**Current Car**\n${carName}\n\n🔥 Streak: ${streak}\n💵 Pot: ${moneyEmoji}${reward.toLocaleString()}${bonusInfo}`;
    }

    function calculateReward(streak) {
      if (streak === 1) return 15000;
      if (streak < 5) return 8000;
      if (streak < 10) return 18000;
      if (streak < 15) return 30000;
      if (streak < 20) return 45000;
      return 60000 + (streak - 20) * 5000;
    }

    let streak = 0;
    let reward = 0;
    let multiplier = 1;
    let bonusRoundsLeft = 0;
    let difficulty = "normal";
    
    // Start with a random bracket
    let currentBracket = CR_BRACKETS[Math.floor(Math.random() * CR_BRACKETS.length)];
    let currentCar = randomCarInRange(currentBracket.min, currentBracket.max);
    let nextCar = randomCarInRange(currentBracket.min, currentBracket.max);
    let gameActive = true;

    const filter = (button) => button.user.id === message.author.id;

    async function playRound() {
      if (!gameActive) return;

      let eventMessage = "";

      if (streak >= 3 && bonusRoundsLeft === 0) {
        const eventRoll = Math.random();
        
        if (eventRoll < 0.15) {
          multiplier = 2;
          bonusRoundsLeft = 3;
          eventMessage = "\n\n🌟 **DOUBLE MONEY ACTIVATED!** (3 rounds)";
        }
        else if (eventRoll < 0.25) {
          const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
          const megaBonus = streak * 5000;
          reward += megaBonus;
          eventMessage = `\n\n💎 **MEGA BONUS!** +${moneyEmoji}${megaBonus.toLocaleString()}`;
        }
        else if (eventRoll < 0.33 && streak >= 10) {
          multiplier = 3;
          bonusRoundsLeft = 1;
          eventMessage = "\n\n⭐ **TRIPLE MONEY!** (1 round)";
        }
      }
      
      if (streak >= 5 && streak % 5 === 0 && streak < 15) {
        difficulty = "hard";
        const newBracket = CR_BRACKETS[Math.floor(Math.random() * CR_BRACKETS.length)];
        currentBracket = newBracket;
        nextCar = randomCarInRange(currentBracket.min, currentBracket.max);
        eventMessage += `\n\n⚠️ **DIFFICULTY INCREASED!** Now playing in ${currentBracket.label}`;
      }
      
      if (streak >= 15) {
        difficulty = "extreme";
        currentBracket = { min: 0, max: 999, label: "All Classes" };
        if (streak === 15) {
          nextCar = randomCar();
          eventMessage += `\n\n🔥 **EXTREME MODE ACTIVATED!** All CR ranges unlocked!`;
        }
      }

      const { high, low, skip } = getButtons("hilo", profile.settings.buttonstyle);
      const row = new ActionRowBuilder().addComponents(high, low, skip);

      const embed = new InfoMessage({
        channel: message.channel,
        title: bonusRoundsLeft > 0 ? `🎰 Hi-Lo Game (${multiplier}x ACTIVE!)` : "🚗 Hi-Lo Game",
        desc: renderCar(currentCar, streak, reward, multiplier, bonusRoundsLeft, currentBracket) + eventMessage,
        author: message.author,
        image: currentCar.racehud || null,
        footer: `Difficulty: ${difficulty.toUpperCase()} | Range: ${currentBracket.label}`
      });

      let reactionMessage;
      try {
        reactionMessage = await embed.sendMessage({ buttons: [row], preserve: true });
      } catch (err) {
        console.error("Failed to send hilo message:", err);
        gameActive = false;
        return;
      }

      let processed = false;
      const collector = message.channel.createMessageComponentCollector({ 
        filter, 
        time: hiloChoiceTime
      });

      collector.on("collect", async (button) => {
        if (processed || !gameActive) return;
        processed = true;

        try {
          if (button.customId === "skip") {
            gameActive = false;
            collector.stop("skipped");
            
            if (bonusRoundsLeft > 0) {
              const cashOutBonus = Math.floor(reward * 0.15);
              reward += cashOutBonus;
              const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
              embed.editEmbed({ 
                title: "⏹️ Cashed Out Early!",
                desc: `You kept your bonus round rewards!\n+${moneyEmoji}${cashOutBonus.toLocaleString()} early cashout bonus`
              });
            } else {
              embed.editEmbed({ title: "⏹️ Game cancelled." });
            }
            
            return embed.sendMessage({ currentMessage: reactionMessage });
          }

          const guessedHigher = button.customId === "high";
          const currentCR = getCarCR(currentCar);
          const nextCR = getCarCR(nextCar);
          const correct = guessedHigher 
            ? nextCR > currentCR 
            : nextCR < currentCR;

          if (!correct) {
            gameActive = false;
            collector.stop("lost");
            
            const nextCarName = carNameGen({ currentCar: nextCar, rarity: true });
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            
            let keptAmount = 0;
            let keepPercentage = 0;
            
            if (streak >= 15) {
              keepPercentage = 75;
            } else if (streak >= 10) {
              keepPercentage = 60;
            } else if (streak >= 5) {
              keepPercentage = 50;
            } else if (streak >= 3) {
              keepPercentage = 30;
            } else if (streak >= 1) {
              keepPercentage = 15;
            }
            
            keptAmount = Math.floor(reward * (keepPercentage / 100));
            const lostAmount = reward - keptAmount;
            reward = keptAmount;
            
            if (Math.random() < 0.05 && streak >= 5) {
              const luckyBonus = Math.floor(lostAmount * 0.25);
              reward += luckyBonus;
              
              embed.editEmbed({
                title: "🍀 LUCKY SAVE!",
                desc: `❌ Wrong guess, but luck was on your side!\n\n**Next Car**\n${nextCarName}\n\n🔥 Streak ended at: ${streak}\n💰 Kept ${keepPercentage}%: ${moneyEmoji}${keptAmount.toLocaleString()}\n🍀 Lucky bonus: ${moneyEmoji}${luckyBonus.toLocaleString()}\n💵 Total saved: ${moneyEmoji}${reward.toLocaleString()}`,
                image: nextCar.racehud || null
              });
            } else {
              const lossMessage = keepPercentage > 0 
                ? `💰 Kept ${keepPercentage}%: ${moneyEmoji}${keptAmount.toLocaleString()}\n💸 Lost: ${moneyEmoji}${lostAmount.toLocaleString()}`
                : `💸 Lost everything`;
              
              embed.editEmbed({
                title: "💥 Wrong Guess!",
                desc: `❌ Incorrect!\n\n**Next Car**\n${nextCarName}\n\n🔥 Streak ended at: ${streak}\n${lossMessage}`,
                image: nextCar.racehud || null
              });
            }
            
            return embed.sendMessage({ currentMessage: reactionMessage });
          }

          // ✅ Correct guess
          streak++;
          let gain = calculateReward(streak);
          const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
          
          gain = Math.floor(gain * multiplier);
          
          const crDiff = Math.abs(nextCR - currentCR);
          let bonusText = "";
          let perfectBonus = 0;
          
          if (crDiff <= 10) {
            perfectBonus = Math.floor(gain * 0.5);
            gain += perfectBonus;
            bonusText = `\n🎯 **CLOSE CALL BONUS!** +${moneyEmoji}${perfectBonus.toLocaleString()}`;
          }
          
          let milestoneBonus = 0;
          if (streak === 5) {
            milestoneBonus = 10000;
            gain += milestoneBonus;
            bonusText += `\n🔥 **5-STREAK MILESTONE!** +${moneyEmoji}${milestoneBonus.toLocaleString()}`;
          } else if (streak === 10) {
            milestoneBonus = 25000;
            gain += milestoneBonus;
            bonusText += `\n🔥 **10-STREAK MILESTONE!** +${moneyEmoji}${milestoneBonus.toLocaleString()}`;
          } else if (streak === 20) {
            milestoneBonus = 75000;
            gain += milestoneBonus;
            bonusText += `\n🔥 **20-STREAK MILESTONE!** +${moneyEmoji}${milestoneBonus.toLocaleString()}`;
          }

          reward += gain;

          if (bonusRoundsLeft > 0) {
            bonusRoundsLeft--;
            if (bonusRoundsLeft === 0) {
              multiplier = 1;
              bonusText += "\n⚠️ Bonus round ended!";
            }
          }

          currentCar = nextCar;
          
          if (difficulty === "extreme") {
            nextCar = randomCar();
          } else {
            nextCar = randomCarInRange(currentBracket.min, currentBracket.max);
          }

          collector.stop("correct");
          
          embed.editEmbed({
            title: "✅ Correct!",
            desc: `You guessed right! +${moneyEmoji}${gain.toLocaleString()}${bonusText}\n\n${renderCar(currentCar, streak, reward, multiplier, bonusRoundsLeft)}`,
            image: currentCar.racehud || null,
            footer: "It gets harder every round…"
          });

          await embed.sendMessage({ currentMessage: reactionMessage });

          setTimeout(() => playRound(), 1500);

        } catch (err) {
          console.error("Hilo interaction error:", err);
          gameActive = false;
        }
      });

      collector.on("end", async (collected, reason) => {
        if (!processed && gameActive) {
          gameActive = false;
          embed.editEmbed({ title: "⏱️ Time's up! Game over." });
          embed.sendMessage({ currentMessage: reactionMessage }).catch(() => {});
        }

        if (!gameActive && reward > 0) {
          trackHiloGame();
          trackMoneyEarned(reward);
          const latestProfile = await profileModel.findOne({ userID: message.author.id });
          const { unclaimedRewards } = latestProfile;
          const index = unclaimedRewards.findIndex(e => e.origin === "Hi-Lo");

          if (index > -1) {
            unclaimedRewards[index].money += reward;
          } else {
            unclaimedRewards.push({
              money: reward,
              origin: "Hi-Lo"
            });
          }

          await profileModel.updateOne(
            { userID: message.author.id },
            { unclaimedRewards }
          );

          const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
          const finalEmbed = new InfoMessage({
            channel: message.channel,
            title: "💰 Rewards Saved!",
            desc: `✅ Game ended!\n\n🔥 Streak: ${streak}\n💵 Earned: **${moneyEmoji}${reward.toLocaleString()}**\n\nUse \`cd-rewards\` to claim your earnings!`,
            author: message.author
          });

          await finalEmbed.sendMessage();
        }
      });
    }

    // Start the first round
    playRound();
  }
};
