"use strict";

const { Schema, model } = require("mongoose");

const serverStatSchema = new Schema({ // this schema is a placeholder and doesn't affect the actual data
    placeholder: String
}, { minimize: false });

const serverStatModel = model("System", serverStatSchema, "system");
module.exports = serverStatModel;