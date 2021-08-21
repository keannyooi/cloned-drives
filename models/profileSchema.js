const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
    userID: { type: String, require: true, unique: true },
    money: { type: Number, default: 0 },
    fuseTokens: { type: Number, default: 0 },
    trophies: { type: Number, default: 0 },
    garage: Array,
    decks: Array,
    hand: Object,
    rrStats: Object,
    dailyStats: Object,
    campaignProgress: Object,
    unclaimedRewards: Object,
    cooldowns: { type: Object, default: {} },
    filter: { type: Object, default: {} },
    settings: { type: Object, default: {} },
}, { minimize: false });

const model = mongoose.model("Profiles", profileSchema);
module.exports = model;