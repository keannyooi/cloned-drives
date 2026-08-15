"use strict";

/**
 * PENDING CARS — cd-pending
 * =========================
 * A cd-carlist for cars that haven't shipped yet: everything sitting in
 * `src/0 Carfiles to Add/`, browsable and searchable in Discord.
 *
 * Locked to staff. These are unreleased cards — spoiling the pipeline to the
 * whole server would take the surprise out of every update.
 *
 * Unlike `cd-sub missing` (which only shows cars still needing artwork), this
 * lists the lot, and marks what each one is still waiting on.
 */

const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { adminRoleID, eventMakerRoleID, testerRoleID, defaultPageLimit } = require("../util/consts/consts.js");
const { scanStaging } = require("../util/functions/stagingCars.js");
const { stagingCrName } = require("../util/functions/submissionDisplay.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");
const { hasRole } = require("../util/functions/submissionViews.js");

const BT = String.fromCharCode(96);
const ALLOWED_ROLES = [adminRoleID, eventMakerRoleID, testerRoleID];

module.exports = {
    name: "pending",
    aliases: ["pendingcars", "upcoming"],
    usage: ["", "[search]", "[search] [page]"],
    args: 0,
    category: "Admin",
    description: "Lists cars staged for a future update, and what each is still waiting on. Staff only.",
    async execute(message, args) {
        const allowed = await Promise.all(ALLOWED_ROLES.map(role => hasRole(message, role)));
        if (!allowed.some(Boolean)) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, this command is staff-only.",
                desc: "These are unreleased cars — no peeking 👀",
                author: message.author
            }).sendMessage();
        }

        // A full scan rather than the cached one: this is an admin tool used
        // right after dropping files in, so it should reflect the disk now.
        const { needsArt, scanned, unreadable, unassigned } = scanStaging();
        const all = [...needsArt].sort((a, b) => a.name.localeCompare(b.name));

        // Trailing number is a page, anything else is a search term.
        const trailingPage = /^\d+$/.test(args[args.length - 1] || "");
        const query = args.slice(0, trailingPage ? -1 : undefined).join(" ").trim().toLowerCase();
        const list = query
            ? all.filter(car => car.name.toLowerCase().includes(query) || car.key === query)
            : all;

        if (list.length === 0) {
            return new InfoMessage({
                channel: message.channel,
                title: query ? `Nothing pending matches "${query}".` : "Nothing is pending.",
                desc: query
                    ? `Run ${BT}cd-pending${BT} with no search to see everything staged.`
                    : `Every staged carfile already has its artwork — ${scanned} file(s) scanned.`,
                author: message.author
            }).sendMessage();
        }

        const { settings } = await profileModel.findOne({ userID: message.author.id });
        const perPage = settings.listamount || defaultPageLimit;
        const totalPages = Math.ceil(list.length / perPage);
        const page = trailingPage ? parseInt(args[args.length - 1]) : 1;

        if (page < 1 || totalPages < page) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The pending list ends at page ${totalPages}.`,
                author: message.author
            }).displayClosest(page).sendMessage();
        }

        return listUpdate(list, page, totalPages, listDisplay, settings);

        function listDisplay(section, page, totalPages) {
            let carList = "";
            for (let i = 0; i < section.length; i++) {
                const car = section[i];
                carList += `**${i + 1}.** ${BT}${car.key}${BT} `;
                carList += car.kind === "upload"
                    ? `${car.name} ⬆️ *awaiting upload*\n`
                    : `${stagingCrName(car)} 🎨 *awaiting artwork*\n`;
            }
            if (carList.length > 1024) {
                return new ErrorMessage({
                    channel: message.channel,
                    title: "This page has too many characters to display.",
                    desc: `Turn on ${BT}Shortened Lists${BT} in ${BT}cd-settings${BT}.`,
                    author: message.author
                });
            }

            const notes = [];
            if (unreadable > 0) notes.push(`⚠️ ${unreadable} file(s) unreadable — run ${BT}cleanCarfiles.js${BT}`);
            if (unassigned > 0) notes.push(`⚠️ ${unassigned} file(s) have no carID — run ${BT}assignStagingIDs.js${BT}`);

            return new InfoMessage({
                channel: message.channel,
                title: `Pending Cars (${list.length} of ${scanned} staged)`,
                desc: (query ? `Search: ${BT}${query}${BT}\n` : "")
                    + `🎨 needs artwork · ⬆️ has art, needs uploading`
                    + (notes.length > 0 ? `\n\n${notes.join("\n")}` : ""),
                author: message.author,
                fields: [{ name: "Car", value: carList }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
        }
    }
};
