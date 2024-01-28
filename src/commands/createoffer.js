"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const offerModel = require("../models/offerSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createoffer",
    aliases: ["newoffer"],
    usage: ["<amount on stock> <offer name>"],
    args: 2,
    category: "Events",
    description: "Creates a limited offer with the name of your choice.",
    async execute(message, args) {
        const offers = await offerModel.find();
        const { totalOffers } = await serverStatModel.findOne({});
        let offerName = args.splice(1, args.length).join(" ");
        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 100) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, stock provided is invalid.",
                desc: "A limited offer's stock is restricted to 1 ~ 10.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }

        if (offers.findIndex(offer => offer.name === offerName) > -1) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, offer name already taken.",
                desc: "Check the list of offers using the command `cd-limitedoffers`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        await offerModel.create({
            offerID: `off${totalOffers + 1}`,
            name: offerName,
            stock: parseInt(args[0])
        });
        await serverStatModel.updateOne({}, { "$inc": { totalOffers: 1 } });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new offer named ${offerName}!`,
            desc: "You can now apply changes to the offer using `cd-editoffer`.",
            author: message.author
        });
        return successMessage.sendMessage();
    }
};