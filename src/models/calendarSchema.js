"use strict";

const { Schema, model } = require("mongoose");

const calendarSchema = new Schema({
    calendarID: String,
    name: String,
    isActive: { type: Boolean, default: false },
    
    // Timing configuration
    startDate: { type: String, default: null },          // ISO date when calendar starts (set when started)
    deadline: { type: String, default: "unlimited" },    // ISO date when calendar ends, or "unlimited"
    unlockTime: { type: String, default: "00:00" },      // Daily unlock time (HH:MM in UTC)
    timezone: { type: String, default: "UTC" },          // Timezone for unlock time
    
    // Days/rounds - each day has one round
    days: { type: Array, default: [] },
    // Structure of each day:
    // {
    //     day: 1,                    // Day number (1-indexed)
    //     carID: "c00123",
    //     upgrade: "699",
    //     track: "t00045",
    //     reqs: {},
    //     rewards: {}
    // }
    
    // Bonus rewards
    streakBonus: {
        type: Object,
        default: {
            enabled: false,
            interval: 7,             // Every X consecutive days
            rewards: {}              // Same format as round rewards
        }
    },
    completionBonus: {
        type: Object,
        default: {
            enabled: false,
            rewards: {}              // Reward for completing ALL days
        }
    },
    
    // Player progress tracking
    playerProgress: { 
        type: Object, 
        default: {} 
    }
    // Structure of playerProgress:
    // {
    //     "userId": {
    //         completedDays: [1, 2, 3],       // Array of completed day numbers
    //         currentStreak: 3,               // Current consecutive day streak
    //         longestStreak: 5,               // Longest streak achieved
    //         lastCompletedDay: 3,            // Last day number completed
    //         lastPlayedDate: "2025-01-03"    // ISO date of last play
    //     }
    // }
}, { minimize: false });

const calendarModel = model("Calendars", calendarSchema);
module.exports = calendarModel;
