"use strict";

/**
 * EVENT-START DM NOTIFICATIONS
 * ============================
 * DMs every player who opted into event notifications that an event has begun.
 * Cursor-streamed in batches so it scales to the whole profile collection
 * without a memory spike. Fire-and-forget: per-user send failures are logged
 * and skipped. Shared by cd-startevent (always) and the auto-event announcer
 * (only when a template opts in via `announceDMs: true`).
 */

const bot = require("../../config/config.js");
const profileModel = require("../../models/profileSchema.js");

const BATCH_SIZE = 50;

async function processBatch(userBatch, eventName) {
    await Promise.all(userBatch.map(async ({ userID }) => {
        try {
            const user = await bot.homeGuild.members.fetch(userID);
            await user.send(`**Notification: The ${eventName} event has officially started!**`);
        } catch (err) {
            console.log(`Unable to send notification to user ${userID}`);
        }
    }));
}

/**
 * @param {string} eventName - the event's display name (used in the DM text).
 */
async function notifyEventStart(eventName) {
    let processedCount = 0;
    const startTime = Date.now();

    console.log(`[EVENT DMs] Starting background notifications for "${eventName}"...`);

    const cursor = profileModel.find({ "settings.sendeventnotifs": true }).cursor();

    let batch = [];
    for await (const profile of cursor) {
        batch.push(profile);

        if (batch.length >= BATCH_SIZE) {
            await processBatch(batch, eventName);
            batch = [];
            processedCount += BATCH_SIZE;
            console.log(`[EVENT DMs] Processed ${processedCount} notifications...`);
        }
    }

    if (batch.length > 0) {
        await processBatch(batch, eventName);
        processedCount += batch.length;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[EVENT DMs] Completed ${processedCount} notifications in ${elapsed}s.`);
}

module.exports = notifyEventStart;
