"use strict";

const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getAllOfferTemplates } = require("../util/functions/dataManager.js");
const search = require("../util/functions/search.js");
const offerModel = require("../models/offerSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createoffer",
    aliases: ["newoffer"],
    usage: [
        "<amount on stock> <offer name>",
        "template <template name>"
    ],
    args: 2,
    category: "Events",
    description: "Creates a limited offer with the name of your choice, or from a template.",
    async execute(message, args) {
        const offers = await offerModel.find();
        const { totalOffers } = await serverStatModel.findOne({});

        // Template mode: cd-createoffer template <template name>
        if (args[0].toLowerCase() === "template") {
            const templateList = getAllOfferTemplates();
            if (templateList.length === 0) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, no offer templates found.",
                    desc: "Add template JSON files to the `src/offers/` folder and restart the bot.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            let query = args.slice(1).map(i => i.toLowerCase());
            await new Promise(resolve => resolve(search(message, query, templateList, "offerTemplate")))
                .then(async (response) => {
                    if (!Array.isArray(response)) return;
                    await createFromTemplate(response[0], response[1]);
                })
                .catch(error => {
                    throw error;
                });
            return;
        }

        // Original mode: cd-createoffer <stock> <name>
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

        async function createFromTemplate(template, currentMessage) {
            // Check if an offer with this name already exists
            if (offers.findIndex(offer => offer.name === template.offerName) > -1) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, offer name already taken.",
                    desc: `An offer named **${template.offerName}** already exists. Check the list of offers using \`cd-limitedoffers\`.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            // Build the offer document from template fields
            const offerData = {
                offerID: `off${totalOffers + 1}`,
                name: template.offerName
            };

            if (template.price !== undefined) offerData.price = template.price;
            if (template.stock !== undefined) offerData.stock = template.stock;
            if (template.duration !== undefined) offerData.deadline = template.duration;
            if (template.offer !== undefined) offerData.offer = { ...template.offer };

            await offerModel.create(offerData);
            await serverStatModel.updateOne({}, { "$inc": { totalOffers: 1 } });

            // Build a summary of what was pre-filled
            const filled = [];
            if (template.price !== undefined) filled.push(`Price: ${template.price.toLocaleString()}`);
            if (template.stock !== undefined) filled.push(`Stock: ${template.stock}`);
            if (template.duration !== undefined) filled.push(`Duration: ${template.duration}`);
            if (template.offer) {
                if (template.offer.cars) filled.push(`Cars: ${template.offer.cars.length}`);
                if (template.offer.pack) filled.push(`Pack: ${template.offer.pack}`);
                if (template.offer.fuseTokens) filled.push(`Fuse Tokens: ${template.offer.fuseTokens}`);
            }

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully created offer "${template.offerName}" from template!`,
                desc: filled.length > 0
                    ? `**Pre-filled from template:**\n${filled.join("\n")}\n\nYou can still edit anything with \`cd-editoffer\`.`
                    : "You can now apply changes to the offer using `cd-editoffer`.",
                author: message.author
            });
            return successMessage.sendMessage({ currentMessage });
        }
    }
};