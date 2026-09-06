"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { defaultWaitTime, defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { isBMCar } = require("../util/functions/cardType.js");
const { getPI, SURFACE_LABELS } = require("../util/functions/paceIndex.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");

module.exports = {
    name: "pi",
    aliases: ["paceindex"],
    usage: ["<car name>", "-<car ID>"],
    args: 1,
    category: "Info",
    description: "Breaks down a car's Pace Index: peak vs average, surface profile, track kings, best niche and best-value CR cap.",
    async execute(message, args) {
        const carFiles = getCarFiles();
        let query = args.map(i => i.toLowerCase()), searchBy = "carWithBM";
        if (args[0].toLowerCase() === "random") {
            return displayInfo(carFiles[Math.floor(Math.random() * carFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-c")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, carFiles, searchBy)))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await displayInfo(...response);
            })
            .catch(error => {
                throw error;
            });

        async function displayInfo(carFile, currentMessage) {
            const currentCar = getCar(carFile);
            const entry = getPI(carFile);
            const name = carNameGen({ currentCar, rarity: true });

            if (!entry) {
                const infoMessage = new InfoMessage({
                    channel: message.channel,
                    title: `Pace Index — ${name}`,
                    desc: "This car isn't rated — opponent-only cars (BOSS) sit outside the field, and the table rebuilds on every restart.",
                    author: message.author,
                    image: currentCar.racehud
                });
                return infoMessage.sendMessage({ currentMessage });
            }

            const stars = entry.stars > 0 ? "⭐".repeat(entry.stars) : "no podiums yet";
            const surfaceLine = Object.entries(SURFACE_LABELS)
                .map(([key, label]) => `${label} **${entry.surfaces[key] === null ? "—" : entry.surfaces[key]}**`)
                .join(" · ");
            // Count only — the top-3 list already names the crowns when there
            // are three or fewer; beyond that a button reveals the full list.
            const kingCount = entry.trackKing.count;
            const tiedKings = entry.trackKing.tied.filter(Boolean).length;
            const king = kingCount === 0
                ? "Not the best on any track."
                : `Best in the game on **${kingCount}** track${kingCount === 1 ? "" : "s"}${tiedKings > 0 ? ` (${tiedKings} shared with another car)` : ""}.`;
            const showKingsButton = kingCount > 3;
            const nicheLine = entry.bestNiche.wins > 0
                ? `#1 of ${entry.bestNiche.size} **${entry.bestNiche.niche}** (${entry.bestNiche.family}) cars on ${entry.bestNiche.wins} track${entry.bestNiche.wins === 1 ? "" : "s"}`
                : `Top ${entry.bestNiche.topPct}% of ${entry.bestNiche.size} **${entry.bestNiche.niche}** (${entry.bestNiche.family}) cars on average`;
            const ceilingLine = entry.bestCeiling
                ? `Best pick under a **CR ${entry.bestCeiling.ceiling}** cap on ${entry.bestCeiling.tracks} track${entry.bestCeiling.tracks === 1 ? "" : "s"}`
                : "Never the best pick under any CR cap.";
            const topTracks = entry.topTracks.map(t =>
                `${t.trackName} — **#${t.rank}** of ${entry.field.toLocaleString("en")}${t.tied ? " (tied)" : ""}${t.rank === 1 ? "" : ` (${t.gap} behind #1)`}`).join("\n") || "—";
            const basisNote = isBMCar(currentCar) && currentCar.reference
                ? `\n*Rated as its base car (${carNameGen({ currentCar: getCar(currentCar.reference), removeBMTag: true })}).*`
                : "";

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Pace Index — ${name}`,
                desc: `**PI ${entry.pi}** / 9999 · ${stars}\n**Peak** — its best ten tracks, ranked against every other car's best ten. **Average ${entry.average}** — mean finish across all tracks. Stars are value — how often it's the best pick for a requirement or a CR cap.${basisNote}`,
                author: message.author,
                image: currentCar.racehud,
                fields: [
                    { name: "Surface Profile", value: surfaceLine },
                    { name: "Track King", value: king },
                    { name: "Best Niche", value: nicheLine, inline: true },
                    { name: "Best Value", value: ceilingLine, inline: true },
                    { name: "Top Tracks", value: topTracks }
                ],
                footer: "PI is relative to the whole field and recomputes on every restart — it can go down when stronger cars arrive."
            });
            const buttons = showKingsButton
                ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("piKings").setLabel("Show winning tracks").setStyle(ButtonStyle.Secondary))]
                : [];
            const sent = await infoMessage.sendMessage({ currentMessage, buttons });
            if (!sent || !showKingsButton) return sent;

            // Lock already released (no preserve) — the reveal is a courtesy
            // that outlives the command, like carlist's page buttons.
            try {
                const interaction = await sent.message.awaitMessageComponent({
                    filter: i => i.user.id === message.author.id && i.customId === "piKings",
                    time: defaultWaitTime
                });
                await interaction.deferUpdate();
                await sent.removeButtons();
                // Same paginated list as cd-tracklist, posted underneath so the
                // PI card stays on screen.
                const { settings } = await profileModel.findOne({ userID: message.author.id }, { settings: 1 });
                const list = entry.trackKing.tracks.map((trackName, i) => trackName + (entry.trackKing.tied[i] ? " (tied)" : "")).sort((a, b) => a.localeCompare(b));
                const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
                const listDisplay = (section, page, totalPages) => new InfoMessage({
                    channel: message.channel,
                    title: `Winning tracks — ${name}`,
                    author: message.author,
                    thumbnail: currentCar.racehud,
                    fields: [{ name: `Outright best on ${kingCount} tracks`, value: section.map((trackName, i) => `**${(page - 1) * (settings.listamount || defaultPageLimit) + i + 1}.** ${trackName}`).join("\n") }],
                    footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
                });
                return listUpdate(list, 1, totalPages, listDisplay, settings);
            }
            catch (_) {
                return sent.removeButtons();   // timed out — just tidy up
            }
        }
    }
};
