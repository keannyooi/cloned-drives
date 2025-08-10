// src/commands/cd-gendaily.js
"use strict";

const { EmbedBuilder } = require("discord.js");
const { events, boostedEvents, bonusThemes, daysOfWeek } = require("../util/functions/dailyThemes.js");

function shuffleArray(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

module.exports = {
    name: "gendaily",
    description: "Generates a full week's events with 1 boosted event and possible bonus themes.",
    async execute(message) {
        // Pick 6 regular events
        const shuffledRegular = shuffleArray([...events]);
        const regularPicks = shuffledRegular.slice(0, 6);

        // Pick 1 boosted event
        const boostedPick = boostedEvents[Math.floor(Math.random() * boostedEvents.length)];

        // Randomly insert boosted event into one of the 7 days
        const boostedIndex = Math.floor(Math.random() * 7);
        const weekEvents = [];
        let regIndex = 0;
        for (let i = 0; i < 7; i++) {
            if (i === boostedIndex) {
                weekEvents.push({ ...boostedPick, boosted: true });
            } else {
                weekEvents.push({ ...regularPicks[regIndex], boosted: false });
                regIndex++;
            }
        }

        // Build schedule
        const schedule = daysOfWeek.map((day, index) => {
            const event = weekEvents[index];

            let bonusText = "";
            if (Math.random() < 0.05) {
                const bonus = bonusThemes[Math.floor(Math.random() * bonusThemes.length)];
                bonusText = `\n🎁 **Bonus Theme:** ${bonus.name} — ${bonus.desc}`;
            }

            return {
                day,
                name: `${event.name}`,
                desc: `${event.desc}${bonusText}`,
                boosted: event.boosted
            };
        });

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle("This Weeks CD Daily Events")
            .setColor("Random")
            .setFooter({ text: "1 boosted event per week. 5% chance per day for bonus themes." });

        schedule.forEach(s => {
            embed.addFields({
                name: s.boosted
                    ? `${s.day} 🚀 BOOSTED`
                    : s.day,
                value: `**${s.name}**\n${s.desc}`
            });
        });

		await message.channel.send({ embeds: [embed] });
	return;

    }
};
