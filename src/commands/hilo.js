//"use strict";
//
//console.log("📥 hilo.js loaded");
//
//const { ActionRowBuilder } = require("discord.js");
//const { readdirSync } = require("fs");
//const { InfoMessage } = require("../util/classes/classes.js");
//const getButtons = require("../util/functions/getButtons.js");
//const profileModel = require("../models/profileSchema.js");
//
//const carFiles = readdirSync("./src/cars").filter(f => f.endsWith(".json"));
//
//module.exports = {
 //   name: "hilo",
  //  usage: [],
   // args: 0,
   // category: "Gameplay",
   // description: "Guess whether the next car will be higher or lower in value.",
//
 //   async execute(message) {
  //      const profile = await profileModel.findOne({ userID: message.author.id });
   //     if (!profile) return;

//        let streak = 0;
 //       let reward = 0;

//        let currentCar = randomCar();
 //       let nextCar = randomCarDifferent(currentCar);

//        const { high, low, skip } = getButtons("hilo", profile.settings.buttonstyle);
 //       const row = new ActionRowBuilder().addComponents(high, low, skip);

//        const embed = new InfoMessage({
  //          channel: message.channel,
    //        title: "🚗 Hi-Lo",
      //      desc: renderCar(currentCar, streak, reward),
        //    author: message.author,
          //  footer: "Choose wisely… higher or lower?"
        //});

        //const gameMessage = await embed.sendMessage({ buttons: [row], preserve: true });

//        const filter = i => i.user.id === message.author.id;
//const collector = message.channel.createMessageComponentCollector({
 //   filter,
  //  time: 30000
//});


     //   collector.on("collect", async button => {
       //     await button.deferUpdate();

         //   if (button.customId === "skip") {
             //   collector.stop("skipped");
           //     embed.editEmbed({ title: "Game cancelled." });
             //   return embed.sendMessage({ currentMessage: gameMessage, buttons: [] });
            //}

       //     const guessedHigher = button.customId === "high";
//const currentValue = getCarValue(currentCar);
//const nextValue = getCarValue(nextCar);
//
//const correct = guessedHigher
 //   ? nextValue > currentValue
 //   : nextValue < currentValue;
//
//
  //          if (!correct) {
 //               collector.stop("lost");
//
   //             embed.editEmbed({
   //                 title: "💥 You Lost!",
   //                 desc: `
//Wrong guess!
//
//**Next Car**
//${nextCar.name}
//💰 $${getCarValue(nextCar).toLocaleString()}
//
//🔥 Final streak: ${streak}
//💸 Lost everything
//`
     //           });
//
      //          return embed.sendMessage({
     //               currentMessage: gameMessage,
      //              buttons: []
       //         });
      //      }
//
            // ✅ Correct guess
       //     streak++;
       //     const gain = calculateReward(streak);
       //     reward += gain;

       //     currentCar = nextCar;
       //     nextCar = randomCarDifferent(currentCar);

       //     embed.editEmbed({
       //         title: "✅ Correct!",
      //          desc: renderCar(currentCar, streak, reward),
       //         footer: "It gets harder every round…"
       //     });

       //     await embed.sendMessage({ currentMessage: gameMessage, preserve: true });
      //  });

     //   collector.on("end", async (reason) => {
       //     if (reward > 0 && reason !== "lost") {
       //         await profileModel.updateOne(
      //              { userID: message.author.id },
       //             { $inc: { money: reward } }
       //         );

        //        embed.editEmbed({
       //             title: "💰 Cashed Out",
        //            desc: `
//Game ended!
//
//🔥 Streak: ${streak}
//💵 Earned: **$${reward.toLocaleString()}**
//`
 //               });

 //               embed.sendMessage({ currentMessage: gameMessage }).catch(() => {});
  //          }
  //      });
 //   }
//};
//
/* ================= HELPERS ================= */

//function randomCar() {
  //  const file = carFiles[Math.floor(Math.random() * carFiles.length)];
  //  const path = `../cars/${file}`;
  //  delete require.cache[require.resolve(path)];
  //  return require(path);
//}

//function randomCarDifferent(car) {
 //   if (carFiles.length < 2) return car;
//
  //  let next;
  //  let attempts = 0;

 //   do {
 //       next = randomCar();
//        attempts++;
  //  } while (next.name === car.name && attempts < 10);
//
 //   return next;
//}
//
//function renderCar(car, streak, reward) {
 //   const value = getCarValue(car);
//
 //   return `
//**Current Car**
//${car.name}
//💰 $${value.toLocaleString()}
//
// 🔥 Streak: ${streak}
// 💵 Pot: $${reward.toLocaleString()}
// `;
//}

//function getCarValue(car) {
  //  if (typeof car.price === "number") return car.price;
  //  if (typeof car.value === "number") return car.value;
  //  if (typeof car.basePrice === "number") return car.basePrice;
  //  if (typeof car.cr === "number") return car.cr * 1000; // fallback scaling
 //   return 0;
//}


//function calculateReward(streak) {
   // if (streak < 3) return 2500;
   // if (streak < 6) return 6000;
   // if (streak < 10) return 12000;
  //  return 20000 + streak * 3000;
//}
