"use strict";

/**
 * cd-testrace — the race engine sandbox
 * =====================================
 * Races two cars with the NEW engine (raceModel.js) on a test track from
 * src/rrtest/, shows the current engine's verdict on the live equivalent
 * beside it, and collects "feels right / feels wrong" votes into the raceLab
 * collection. Nothing here pays, counts or changes anything.
 *
 *   cd-testrace                           guided: pick a track, type an opponent — your hand races it (like cd-qr)
 *   cd-testrace <track>                   same, with the track already chosen
 *   cd-testrace <car A> [tune] vs <car B> [tune] [on <track>]   one-liner; "hand" = your set hand
 *   cd-testrace lap <car> [tune]          lap times on every test track
 *   cd-testrace tracks                    the test tracks and their computed shares
 *
 * Tunes are the usual codes (000 333 666 699 969 996), track is a test-track
 * id ("rt00001:dry"), part of its name, or "random" (the default).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const bot = require("../config/config.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, defaultWaitTime, adminRoleID } = require("../util/consts/consts.js");
const profileModel = require("../models/profileSchema.js");
const handMissingError = require("../util/commonerrors/handMissingError.js");
const search = require("../util/functions/search.js");
const testTracks = require("../util/functions/testTracks.js");
const model = require("../util/functions/raceModel.js");
const { getAvailableTunes, isValidTune } = require("../util/functions/calcTune.js");
const { evalScore: liveEvalScore, getTuned: liveTuned } = require("../util/functions/pgGenerator.js");
const { PHASES } = require("../util/functions/trackV2.js");
const raceLabModel = require("../models/raceLabSchema.js");

const TUNES = getAvailableTunes();
const VOTE_WINDOW = Math.max(defaultChoiceTime || 0, 120000);

const nameOf = car => `${Array.isArray(car.make) ? car.make[0] : car.make} ${car.model} (${car.modelYear})`;
const clock = seconds => seconds >= 60 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}` : `${seconds.toFixed(2)} s`;
const sharesOf = track => track.phases ? PHASES.map(key => `${key[0].toUpperCase()}${track.phases[key]}`).join("/") : "—";
// Placeholder art adds nothing and an embed edit that carries an image the
// Discord proxy has not fetched yet renders stale — skip it entirely.
const realImage = url => (typeof url === "string" && url && !/Temp\.png$/i.test(url)) ? url : undefined;
// Replace a picker prompt with a fresh message instead of editing it: an edit
// that swaps embed + image + components is the flaky path on Discord's side.
async function replacePrompt(prompt) {
    if (prompt && prompt.message && typeof prompt.message.delete === "function") await prompt.message.delete().catch(() => {});
}

module.exports = {
    name: "testrace",
    aliases: ["tr", "racelab"],
    usage: ["", "<track>", "<car A> [tune] vs <car B> [tune] [on <track>]", "lap <car> [tune]", "tracks"],
    args: 0,
    category: "Gameplay",          // open to everyone — "Testing" would gate it to the tester role
    cooldown: 5,
    description: "Sandbox for the new race engine. Race any two cars on a test track, see the new verdict next to the current one, and vote on whether it feels right. No rewards, no stats, no effect on anything.",
    async execute(message, args) {
        if (!args.length) return guidedFlow(message, null);
        const first = args[0].toLowerCase();
        if (first === "tracks") return listTracks(message);
        if (first === "help") return usage(message);
        if (first === "lap") return lapTimes(message, args.slice(1));
        if (first === "reload") return reloadTracks(message);

        const lower = args.map(token => token.toLowerCase());
        const vsAt = lower.indexOf("vs");
        // No "vs": the words are a track, like cd-qr <track> — guided from there.
        if (vsAt < 0) return guidedFlow(message, args.join(" "));
        // "<car A> [tune] vs <car B> [tune] [on <track>]"
        if (vsAt === 0 || vsAt === args.length - 1) return usage(message);
        const onAt = lower.indexOf("on", vsAt + 1);
        const segmentA = parseCarSegment(args.slice(0, vsAt));
        const segmentB = parseCarSegment(args.slice(vsAt + 1, onAt > 0 ? onAt : args.length));
        const trackQuery = onAt > 0 ? args.slice(onAt + 1).join(" ") : "random";
        if (!segmentA.query.length || !segmentB.query.length) return usage(message);

        const track = pickTrack(trackQuery);
        if (!track) {
            return new ErrorMessage({
                channel: message.channel,
                title: "No test track matches that.",
                desc: `Try one of:\n${testTracks.getTestTracks().map(t => `\`${t.trackID}\` ${t.trackName}`).join("\n") || "— no test tracks loaded —"}`,
                author: message.author
            }).sendMessage();
        }

        const carFiles = getCarFiles();
        let carA, promptA = null;
        if (segmentA.query.length === 1 && segmentA.query[0] === "hand") {
            const hand = await loadHand(message);
            if (!hand) return;
            carA = hand.car;
            if (!segmentA.explicitTune) segmentA.tune = hand.tune;
        }
        else {
            const pickedA = await search(message, segmentA.query, carFiles, segmentA.searchBy);
            if (!Array.isArray(pickedA)) return;
            carA = getCar(pickedA[0]);
            promptA = pickedA[1];
        }
        let carB, promptB = promptA;
        if (segmentB.query.length === 1 && segmentB.query[0] === "hand") {
            const hand = await loadHand(message);
            if (!hand) return;
            carB = hand.car;
            if (!segmentB.explicitTune) segmentB.tune = hand.tune;
        }
        else {
            const pickedB = await search(message, segmentB.query, carFiles, segmentB.searchBy, promptA);
            if (!Array.isArray(pickedB)) return;
            carB = getCar(pickedB[0]);
            promptB = pickedB[1];
        }
        if (!carA || !carB) return;
        return runRace(message, { carA, tuneA: segmentA.tune, carB, tuneB: segmentB.tune, track }, promptB);
    },
    recordVote,
    matchupKey
};

// ─── parsing ─────────────────────────────────────────────────────────────────

function parseCarSegment(tokens) {
    const words = tokens.slice();
    let tune = "000", explicitTune = false;
    if (words.length > 1 && TUNES.includes(words[words.length - 1])) { tune = words.pop(); explicitTune = true; }
    let query = words.map(word => word.toLowerCase()), searchBy = "carWithBM";
    if (query.length === 1 && /^-c\d{5}$/.test(query[0])) { query = [query[0].slice(1)]; searchBy = "id"; }
    return { query, tune, explicitTune, searchBy };
}

// ─── the guided flow (mirrors cd-qr: your hand vs a car you name, on a track you pick) ──

/** The player's set hand as a car + tune, or null after the standard "no hand" error. */
async function loadHand(message) {
    const profile = await profileModel.findOne({ userID: message.author.id }, { hand: 1, settings: 1 });
    const hand = profile && profile.hand;
    const car = hand && hand.carID ? getCar(hand.carID) : null;
    if (!car) { await handMissingError(message); return null; }
    const tune = isValidTune(String(hand.upgrade)) ? String(hand.upgrade) : "000";
    return { car, tune, settings: (profile && profile.settings) || {} };
}

function randomCar() {
    const files = getCarFiles();
    for (let i = 0; i < 50; i++) {
        const car = getCar(files[Math.floor(Math.random() * files.length)]);
        if (car && !car.reference && typeof car.topSpeed === "number" && typeof car.handling === "number") return car;
    }
    return null;
}

function mixText(track) {
    return track.mix ? Object.entries(track.mix).map(([surface, share]) => ` + ${Math.round(share * 100)}% ${surface}`).join("") : "";
}

function trackLine(track) {
    return `${track.weather} ${track.surface}${mixText(track)}${track.distance ? ` · ${track.distance} mi` : ""} · ${track.speedbumps} bump${track.speedbumps === 1 ? "" : "s"}, ${track.humps} hump${track.humps === 1 ? "" : "s"}`;
}

async function guidedFlow(message, trackQuery) {
    const hand = await loadHand(message);
    if (!hand) return;
    const tracks = testTracks.getTestTracks();
    if (!tracks.length) {
        return new ErrorMessage({ channel: message.channel, title: "No test tracks loaded.", desc: "An admin can run `cd-testrace reload`.", author: message.author }).sendMessage();
    }
    const handLine = `${nameOf(hand.car)} \`${hand.tune}\``;

    // 1) the track: from the words given, or a dropdown
    let track = null, prompt = null;
    if (trackQuery) {
        track = pickTrack(trackQuery);
        if (!track) {
            return new ErrorMessage({
                channel: message.channel,
                title: "No test track matches that.",
                desc: `Try one of:\n${tracks.map(t => `\`${t.trackID}\` ${t.trackName}`).join("\n")}\nOr just type \`cd-testrace\` to pick from a list.`,
                author: message.author
            }).sendMessage();
        }
    }
    else {
        const menu = new StringSelectMenuBuilder()
            .setCustomId("testrace_track")
            .setPlaceholder("Pick a test track…")
            .addOptions(...tracks.slice(0, 25).map(t => ({ label: t.trackName.slice(0, 100), value: t.trackID, description: trackLine(t).slice(0, 100) })));
        prompt = await new InfoMessage({
            channel: message.channel,
            title: "🧪 Test race — pick a track",
            desc: "Your hand races a car you choose on the **new** engine. Nothing here pays, counts or changes anything — you just get to say whether the result feels right.",
            author: message.author,
            fields: [{ name: "Your hand", value: handLine }],
            footer: `You have ${defaultWaitTime / 1000} seconds to decide.`
        }).sendMessage({ buttons: [new ActionRowBuilder().addComponents(menu)], preserve: true });
        if (!prompt || !prompt.message) return;
        try {
            const selection = await message.channel.awaitMessageComponent({
                filter: interaction => interaction.user.id === message.author.id && interaction.customId === "testrace_track",
                max: 1, time: defaultWaitTime, errors: ["time"]
            });
            await selection.deferUpdate();
            track = testTracks.getTestTrack(selection.values[0]);
        }
        catch (err) {
            return new ErrorMessage({ channel: message.channel, title: "Action cancelled automatically.", desc: `No track picked within ${defaultWaitTime / 1000} seconds.`, author: message.author }).sendMessage({ currentMessage: prompt });
        }
        if (!track) return;
    }

    // 2) the opponent, typed
    prompt = await new InfoMessage({
        channel: message.channel,
        title: `${track.trackName} has been chosen!`,
        desc: "Type the car to race against. Put a tune code at the end if you want one (e.g. `cayenne turbo gt 996`) — no code means stock. Type `random` for a random car.",
        author: message.author,
        image: realImage(track.background),
        fields: [{ name: "Your hand", value: handLine, inline: true }, { name: "Track", value: trackLine(track), inline: true }],
        footer: `You have ${defaultWaitTime / 1000} seconds to consider.`
    }).sendMessage({ currentMessage: prompt, preserve: true });
    if (!prompt || !prompt.message) return;

    let reply;
    try {
        const collected = await message.channel.awaitMessages({ filter: response => response.author.id === message.author.id, max: 1, time: defaultWaitTime, errors: ["time"] });
        reply = collected.first();
    }
    catch (err) {
        return new ErrorMessage({ channel: message.channel, title: "Action cancelled automatically.", desc: `No car named within ${defaultWaitTime / 1000} seconds.`, author: message.author }).sendMessage({ currentMessage: prompt });
    }
    if (message.channel.type !== 1 && reply && typeof reply.delete === "function") reply.delete().catch(() => {});

    const segment = parseCarSegment(String(reply.content || "").trim().split(/ +/).filter(Boolean));
    let opponent = null;
    if (segment.query.length === 1 && segment.query[0] === "random") opponent = randomCar();
    else if (segment.query.length) {
        const picked = await search(message, segment.query, getCarFiles(), segment.searchBy, prompt);
        if (!Array.isArray(picked)) return;
        opponent = getCar(picked[0]);
        prompt = picked[1] || prompt;
    }
    if (!opponent) return usage(message);
    return runRace(message, { carA: hand.car, tuneA: hand.tune, carB: opponent, tuneB: segment.tune, track }, prompt);
}

function pickTrack(query) {
    const tracks = testTracks.getTestTracks();
    if (!tracks.length) return null;
    const q = String(query || "random").trim().toLowerCase();
    if (q === "random" || q === "") return tracks[Math.floor(Math.random() * tracks.length)];
    return tracks.find(t => t.trackID.toLowerCase() === q)
        || tracks.find(t => t.layoutID.toLowerCase() === q)
        || tracks.find(t => t.trackName.toLowerCase().includes(q))
        || null;
}

function matchupKey({ track, carA, tuneA, carB, tuneB }) {
    return `${track.trackID}|${carA.carID}|${tuneA}|${carB.carID}|${tuneB}`;
}

// ─── the race ────────────────────────────────────────────────────────────────

function verdicts(setup) {
    const { carA, tuneA, carB, tuneB, track } = setup;
    const fresh = model.evalScore(carA, tuneA, carB, tuneB, track);
    const live = testTracks.getEquivalentLiveTrack(track);
    let old = null;
    if (live) {
        try { old = liveEvalScore(liveTuned(carA.carID, tuneA), liveTuned(carB.carID, tuneB), live); }
        catch (err) { old = null; }
    }
    return { fresh, old, live };
}

function buildEmbed(message, setup, { fresh, old, live }, voteCounts) {
    const { carA, tuneA, carB, tuneB, track } = setup;
    const nameA = nameOf(carA), nameB = nameOf(carB);
    const winnerName = fresh.winner === "A" ? nameA : fresh.winner === "B" ? nameB : null;

    const newLines = [];
    if (fresh.a.dnf || fresh.b.dnf) newLines.push(`**${winnerName || "Tie"}**${winnerName ? ` by **${Math.abs(fresh.points)} pts**` : ""} — ${fresh.reason}.`);
    else if (!winnerName) newLines.push("**Dead heat.**");
    else newLines.push(`**${winnerName}** by **${Math.abs(fresh.points)} pts** — ${Math.abs(fresh.marginSeconds)} s, ${Math.abs(fresh.marginPercent ?? 0)}% of the reference lap.`);
    if (fresh.breakdown.length) newLines.push(`From ${nameA}'s side: ${model.describeBreakdown(fresh.breakdown)}`);

    const lapLine = car => {
        const lap = car === "A" ? fresh.a : fresh.b;
        const p = lap.profile;
        return `${car === "A" ? nameA : nameB} \`${p.tune}\`: **${lap.dnf ? "DNF" : clock(lap.seconds)}**` +
            `${lap.dnf ? "" : ` · traction ${lap.factors.traction.toFixed(2)} · grip ${lap.factors.grip.toFixed(2)} · ${p.power.toFixed(0)} PS${p.powerEstimated ? " (est.)" : ""}${lap.factors.accelCap === Infinity ? "" : ` · accel cap ${(lap.factors.accelCap / 9.81).toFixed(2)} g`}`}`;
    };

    let oldLine;
    if (!live) oldLine = "This test track has no live equivalent, so there is nothing to compare.";
    else if (old === null) oldLine = `Could not score this pair on the live ${live.trackName}.`;
    else {
        const oldWinner = old > 0 ? nameA : old < 0 ? nameB : null;
        oldLine = `On the live **${live.trackName}**: ${oldWinner ? `**${oldWinner}** by **${Math.abs(Math.round(old * 100) / 100)} pts**` : "**a tie**"}.`;
        const agree = (old > 0 && fresh.points > 0) || (old < 0 && fresh.points < 0) || (old === 0 && fresh.points === 0);
        oldLine += agree ? "\n✅ Both engines pick the same winner." : "\n⚠️ The two engines disagree — exactly the kind of race we want your vote on.";
    }

    const fields = [
        { name: "New engine", value: newLines.join("\n").slice(0, 1024) },
        { name: "Lap times", value: `${lapLine("A")}\n${lapLine("B")}`.slice(0, 1024) },
        { name: "Current engine", value: oldLine.slice(0, 1024) }
    ];
    if (voteCounts) fields.push({ name: "Votes so far", value: `👍 ${voteCounts.right} feels right · 👎 ${voteCounts.wrong} feels wrong` });

    return new InfoMessage({
        channel: message.channel,
        title: `🧪 Test race — ${nameA} vs ${nameB}`,
        desc: [
            `**${track.trackName}** · ${trackLine(track)}${track.start ? ` · ${track.start} start` : ""}`,
            "Sandbox only: nothing here pays, counts or changes anything. Vote below on whether the result feels right."
        ].join("\n"),
        author: message.author,
        image: realImage(track.background),
        thumbnail: realImage(track.map),
        fields,
        footer: `${message.author.username} can press Best tunes to re-run with each car's fastest tune. Anyone can vote.`
    });
}

function buttons() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lab_right").setLabel("Feels right").setEmoji("👍").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("lab_wrong").setLabel("Feels wrong").setEmoji("👎").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("lab_best").setLabel("Best tunes").setEmoji("🔧").setStyle(ButtonStyle.Secondary)
    )];
}

async function runRace(message, setup, currentMessage) {
    let current = setup;
    let scored = verdicts(current);
    await replacePrompt(currentMessage);
    let sent = await buildEmbed(message, current, scored, null).sendMessage({ buttons: buttons(), preserve: true });
    if (!sent || !sent.message) return;

    const collector = sent.message.createMessageComponentCollector({ time: VOTE_WINDOW });
    collector.on("collect", async button => {
        try {
            if (button.customId === "lab_best") {
                if (button.user.id !== message.author.id) {
                    return button.reply({ content: "Only the person who started this race can re-run it.", flags: MessageFlags.Ephemeral });
                }
                const bestA = model.bestTune(current.carA, current.track), bestB = model.bestTune(current.carB, current.track);
                current = { ...current, tuneA: bestA ? bestA.tune : current.tuneA, tuneB: bestB ? bestB.tune : current.tuneB };
                scored = verdicts(current);
                await button.update({ embeds: [buildEmbed(message, current, scored, null).embed], components: buttons() });
                return;
            }
            const verdict = button.customId === "lab_right" ? "right" : "wrong";
            const counts = await recordVote(current, scored, button.user.id, verdict);
            await button.reply({ content: `Recorded: this result **feels ${verdict}** to you. ${counts.right} 👍 · ${counts.wrong} 👎 so far. Thank you — this is what tunes the new engine.`, flags: MessageFlags.Ephemeral });
            await sent.message.edit({ embeds: [buildEmbed(message, current, scored, counts).embed], components: buttons() }).catch(() => {});
        }
        catch (err) {
            console.error("[testrace] button failed:", err.message);
            if (!button.replied && !button.deferred) button.reply({ content: "Something went wrong recording that.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });
    collector.on("end", () => { sent.message.edit({ components: [] }).catch(() => {}); });
}

/** Upsert a player's verdict on a matchup; returns the current counts. */
async function recordVote(setup, scored, userID, verdict) {
    const key = matchupKey(setup);
    const now = new Date().toISOString();
    const doc = await raceLabModel.findOneAndUpdate(
        { key },
        {
            $set: {
                key, isDev: !!bot.devMode,
                trackID: setup.track.trackID, trackName: setup.track.trackName, equivalentTrackID: setup.track.equivalentTrackID || "",
                carA: setup.carA.carID, tuneA: setup.tuneA, carB: setup.carB.carID, tuneB: setup.tuneB,
                nameA: nameOf(setup.carA), nameB: nameOf(setup.carB),
                newPoints: scored.fresh.points, newMarginSeconds: scored.fresh.marginSeconds ?? 0, oldPoints: scored.old,
                [`votes.${userID}`]: { verdict, at: now },
                updatedAt: now
            },
            $setOnInsert: { createdAt: now }
        },
        { upsert: true, new: true }
    );
    const votes = Object.values(doc.votes || {});
    const counts = { right: votes.filter(v => v.verdict === "right").length, wrong: votes.filter(v => v.verdict === "wrong").length };
    await raceLabModel.updateOne({ key }, { $set: { rightCount: counts.right, wrongCount: counts.wrong } });
    return counts;
}

// ─── the other modes ─────────────────────────────────────────────────────────

async function lapTimes(message, args) {
    if (!args.length) return usage(message);
    const segment = parseCarSegment(args);
    const picked = await search(message, segment.query, getCarFiles(), segment.searchBy);
    if (!Array.isArray(picked)) return;
    const [file, prompt] = picked;
    await replacePrompt(prompt);
    const car = getCar(file);
    const tracks = testTracks.getTestTracks();
    const lines = tracks.map(track => {
        const lap = model.lapTime(car, segment.tune, track);
        const best = model.bestTune(car, track);
        const bestText = best && best.tune !== segment.tune ? ` · best \`${best.tune}\` ${clock(best.seconds)}` : "";
        return `**${track.trackName}** — \`${segment.tune}\` ${lap.dnf ? "DNF" : clock(lap.seconds)}${bestText}`;
    });
    return new InfoMessage({
        channel: message.channel,
        title: `🧪 Lap times — ${nameOf(car)}`,
        desc: lines.join("\n").slice(0, 4000) || "No test tracks loaded.",
        author: message.author,
        footer: "New engine, sandbox tracks only."
    }).sendMessage();
}

/** Admin: re-read src/rrtest without a restart. */
function reloadTracks(message) {
    const member = message.member;
    if (!member || !member.roles || !member.roles.cache.has(adminRoleID)) {
        return new ErrorMessage({ channel: message.channel, title: "Admins only.", desc: "Reloading the test tracks is an admin action.", author: message.author }).sendMessage();
    }
    const stats = testTracks.reload("./src");
    testTracks.logSummary();
    const lines = [`${stats.layouts} layout(s) → ${stats.variants} variant(s).`];
    if (stats.failed) {
        lines.push(`${stats.failed} file(s) skipped:`);
        for (const entry of stats.errors) lines.push(`• ${entry.file}: ${entry.errors.join(" | ")}`);
    }
    if (stats.warnings) lines.push(`${stats.warnings} warning(s) — run scripts/raceModel/validateTracks.js for details.`);
    return new InfoMessage({
        channel: message.channel,
        title: "🧪 Test tracks reloaded",
        desc: lines.join("\n").slice(0, 4000),
        author: message.author
    }).sendMessage();
}

function listTracks(message) {
    const tracks = testTracks.getTestTracks();
    const lines = tracks.map(t => `\`${t.trackID}\` **${t.trackName}** · ${t.weather} ${t.surface}${mixText(t)}${t.distance ? ` · ${t.distance} mi` : ""} · ${t.speedbumps} bumps, ${t.humps} humps · shares ${sharesOf(t)}${t.equivalentTrackID ? ` · live ${t.equivalentTrackID}` : ""}`);
    return new InfoMessage({
        channel: message.channel,
        title: "🧪 Test tracks",
        desc: (lines.join("\n") || "No test tracks loaded.").slice(0, 4000),
        author: message.author,
        footer: "Shares: L launch · P pull · F flat-out · C corners · T transitions, computed from the layout facts."
    }).sendMessage();
}

function usage(message) {
    return new InfoMessage({
        channel: message.channel,
        title: "🧪 cd-testrace — the race engine sandbox",
        desc: [
            "`cd-testrace` — pick a track from a list, then type a car: your hand races it",
            "`cd-testrace <track>` — same, track already chosen (e.g. `cd-testrace kenya`)",
            "`cd-testrace <car A> [tune] vs <car B> [tune] [on <track>]` — any two cars; `hand` means your set hand",
            "`cd-testrace lap <car> [tune]` — lap times on every test track",
            "`cd-testrace tracks` — the test tracks",
            "",
            `Tunes: ${TUNES.map(t => `\`${t}\``).join(" ")} (default \`000\`). Track: a test-track id, part of its name, or \`random\`.`,
            "Example: `cd-testrace cayman gt4 699 vs cayenne turbo gt 699 on kenya`",
            "",
            "Nothing here pays, counts or changes anything. The votes go to the team."
        ].join("\n"),
        author: message.author
    }).sendMessage();
}
