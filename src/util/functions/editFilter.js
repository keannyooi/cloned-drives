"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith('.json'));
const { SuccessMessage, ErrorMessage } = require("../classes/classes.js");
const carNameGen = require("./carNameGen.js");

function editFilter(message, filter, args) {
    const criteria = format(args[0]),
        arg1 = typeof args[1] === "object" ? args[1] : args[1].toLowerCase(),
        arg2 = args[2]?.toLowerCase();
    let successMessage, isValid;
    switch (criteria) {
        case "make":
        case "tags":
        case "collection":
        case "bodyStyle":
            let argument = args.slice(1, args.length).join(" ").toLowerCase();
            isValid = carFiles.findIndex(function (carFile) {
                let currentCar = require(`../../cars/${carFile}`);
                if (criteria === "collection" && !currentCar["reference"]) {
                    return false;
                }
                else if (Array.isArray(currentCar[criteria])) {
                    return currentCar[criteria].some(tag => tag.toLowerCase() === argument);
                }
                else {
                    return currentCar[criteria].toLowerCase() === argument;
                }
            });

            if (isValid > -1) {
                if (!filter[criteria]) {
                    filter[criteria] = [argument];
                }
                else if (!filter[criteria].some(criteria => criteria === argument)) {
                    filter[criteria].push(argument);
                }
            }
            else {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, argument provided either does not exist in the game or is already part of the specified filter category.",
                    desc: "Maybe you have made a typo.",
                    author: message.author
                }).displayClosest(argument);
                return errorMessage.sendMessage();
            }

            successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully modified the \`${criteria}\` filter category!`,
                author: message.author,
                fields: [{ name: "Current Value(s)", value: `\`${filter[criteria].join(", ")}\`` }]
            });
            break;
        case "modelYear":
        case "seatCount":
        case "rq":
            const start = parseInt(arg1);
            let end = start;
            if (arg2 && !isNaN(arg2)) {
                end = parseInt(arg2);
            }
            if (isNaN(start)) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, filter criteria provided is not a number.",
                    desc: `\`${criteria}\` criterias must be a number, i.e: \`1969\`, \`2001\`, etc.`,
                    author: message.author
                }).displayClosest(start);
                return errorMessage.sendMessage();
            }
            else if (end < start) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, order of numbers provided is invalid.",
                    desc: "Check if you got the order right: Smaller number first, bigger number later.",
                    author: message.author
                }).displayClosest(`${start} ~ ${end}`);
                return errorMessage.sendMessage();
            }

            filter[criteria] = { start, end };
            successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully modified the \`${criteria}\` filter category!`,
                author: message.author,
                fields: [
                    { name: "Start", value: `\`${start}\``, inline: true },
                    { name: "End", value: `\`${end}\``, inline: true }
                ]
            });
            break;
        case "country":
        case "tyreType":
        case "driveType":
        case "enginePos":
        case "fuelType":
        case "gc":
            isValid = carFiles.findIndex(function (carFile) {
                let currentCar = require(`../../cars/${carFile}`);
                return currentCar[criteria].toLowerCase() === arg1;
            });

            if (isValid > -1) {
                filter[criteria] = arg1;
            }
            else {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, argument provided does not exist in the game.",
                    desc: "Maybe you have made a typo.",
                    author: message.author
                }).displayClosest(arg1);
                return errorMessage.sendMessage();
            }

            successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully modified the \`${criteria}\` filter category!`,
                author: message.author,
                fields: [{ name: "Current Value", value: `\`${filter[criteria]}\`` }]
            });
            break;
        case "abs":
        case "tcs":
        case "isPrize":
        case "isStock":
        case "isMaxed":
        case "isOwned":
            try {
                filter[criteria] = JSON.parse(arg1);
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully set the \`${criteria}\` criteria to \`${arg1}\`!`,
                    author: message.author
                });
            }
            catch (error) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, argument provided is not a boolean.",
                    desc: "Booleans only have 2 states, `true` or `false`.",
                    author: message.author
                }).displayClosest(arg1);
                return errorMessage.sendMessage();
            }
            break;
        case "search":
            let arg = args.slice(1, args.length).join(" ").toLowerCase();
            isValid = carFiles.findIndex(function (carFile) {
                let currentCar = require(`../../cars/${carFile}`);
                return carNameGen({ currentCar }).toLowerCase().includes(arg);
            });
            if (isValid > -1) {
                filter[criteria] = arg;
            }
            else {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, keyword provided returned no results.",
                    desc: "Maybe you have made a typo.",
                    author: message.author
                }).displayClosest(arg);
                return errorMessage.sendMessage();
            }

            successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Successfully modified the model name search category!",
                author: message.author,
                fields: [{ name: "Current Value", value: `\`${filter[criteria]}\`` }]
            });
            break;
        case "applyreqs":
            if (typeof arg1 !== "object") {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this function is not supported for `cd-editevent`.`",
                    desc: "This functionality is only meant for `cd-filter`.",
                    author: message.author
                }).displayClosest(arg);
                return errorMessage.sendMessage();
            }
            else {
                filter = {};
                for (let [req, value] of Object.entries(arg1)) {
                    filter[req] = value;
                }

                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: "Successfully applied random race criterias!",
                    author: message.author
                });
            }
            break;
        case "disable":
        case "remove":
            const criteria2 = format(arg1);
            switch (criteria2) {
                case "all":
                    filter = {};
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: "Successfully cleared all filter categories!",
                        author: message.author
                    });
                    break;
                case "make":
                case "tags":
                case "bodyStyle":
                    if (!arg2) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, filter criteria not provided.",
                            desc: "You are expected to provide the name of a filter criteria after the filter category.",
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }

                    let string = args.slice(2, args.length).join(" ").toLowerCase();
                    if (string === "all") {
                        delete filter[criteria2];
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully cleared the \`${criteria2}\` filter category!`,
                            author: message.author
                        });
                    }
                    else if (filter[criteria2] && filter[criteria2].some(criteria => criteria === string)) {
                        filter[criteria2].splice(filter[criteria2].indexOf(string), 1);
                        successMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully modified the \`${criteria2}\` filter category!`,
                            author: message.author
                        });
                        if (filter[criteria2].length === 0) {
                            delete filter[criteria2];
                        }
                        else {
                            successMessage.editEmbed({ fields: [{ name: "Current Value(s)", value: `\`${filter[criteria2]}\`` }] });
                        }
                    }
                    else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, 404 filter category argument not found.",
                            desc: "Try rechecking the filter list using `cd-filter view`.",
                            author: message.author
                        }).displayClosest(string);
                        return errorMessage.sendMessage();
                    }
                    break;
                case "modelYear":
                case "country":
                case "tyreType":
                case "seatCount":
                case "enginePos":
                case "driveType":
                case "fuelType":
                case "isPrize":
                case "isStock":
                case "isMaxed":
                case "isOwned":
                case "gc":
                case "rq":
                case "search":
                    delete filter[criteria2];
                    successMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully cleared the \`${criteria2}\` crtieria!`,
                        author: message.author
                    });
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, filter category provided doesn't exist.",
                        desc: `Here is a list of available filter criterias. 
                                \`rq\` - Filter by RQ.
                                \`make\` - Filter by make/manufacturer. Provide the manufacturer name that you want to remove, or type \`all\` to remove all criterias in this category.
                                \`modelyear\` - Filter by model year range.
                                \`country\` - Filter by country origin. Provide the country code that you want to remove, or type \`all\` to remove all criterias in this category.
                                \`drivetype\` - Filter by drive type. 
                                \`tyretype\` - Filter by tyre type. Provide the type of tyre that you want to remove, or type \`all\` to remove all criterias in this category.
                                \`gc\` - Filter by ground clearance.
                                \`bodystyle\` - Filter by body type.  
                                \`seatcount\` - Filter by seat count.
                                \`enginepos\` - Filter by engine position.
                                \`fueltype\` - Filter by fuel type.
                                \`isprize\` - Filter prize cars.
                                \`isstock\` - Filter stock cars.
                                \`isupgraded\` - Filter upgraded cars.
                                \`ismaxed\` - Filter maxed cars.
                                \`isowned\` - Filter cars that you own.
                                \`tags\` - Filter by tag. Provide the tag that you want to remove, or type \`all\` to remove all criterias in this category.
                                \`search\` - Filter by keyword in car name.
                                \`all\` - Remove all filters.`,
                        author: message.author
                    }).displayClosest(criteria2);
                    return errorMessage.sendMessage();
            }
            break;
        default:
            let errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, filter category provided doesn't exist.",
                desc: `Here is a list of available filter criterias. 
                        \`rq\` - Filter by RQ. Provide the start of the RQ range desired and the end after that.
                        \`make\` - Filter by make/manufacturer. Provide a valid manufacturer name after that.
                        \`modelyear\` - Filter by model year range. Provide the start of the model year range desired and the end after that.
                        \`country\` - Filter by country origin. Provide a country code after that.
                        \`drivetype\` - Filter by drive type. Provide a drive type (\`FWD\`, \`RWD\`, etc.) after that.
                        \`tyretype\` - Filter by tyre type. Provide one kind of tyre (\`standard\`, \`performance\`, etc.) after that.
                        \`gc\` - Filter by ground clearance. Provide a ground clearance (\`low\`, \`medium\` or \`high\`) after that.
                        \`bodystyle\` - Filter by body type. Provide a drive type (\`sedan\`, \`coupe\`, etc.) after that.
                        \`seatcount\` - Filter by seat count. Provide the start of the seat count range desired and the end after that.
                        \`enginepos\` - Filter by engine position. Provide an engine position (\`front\`, \`middle\`, etc.) after that.
                        \`fueltype\` - Filter by fuel type. Provide a fuel type (\`petrol\`, \`electric\`, etc.) after that.
                        \`isprize\` - Filter prize cars. Provide a boolean (\`true\` or \`false\`) after that.
                        \`isstock\` - Filter stock cars. Provide a boolean (\`true\` or \`false\`) after that.
                        \`isupgraded\` - Filter upgraded cars. Provide a boolean (\`true\` or \`false\`) after that.
                        \`ismaxed\` - Filter maxed cars. Provide a boolean (\`true\` or \`false\`) after that.
                        \`isowned\` - Filter cars that you own. Provide a boolean (\`true\` or \`false\`) after that.
                        \`tags\` - Filter by tag. Provide a valid tag after that.
                        \`collection\` - Filter by tag. Provide a valid collection after that.
                        \`search\` - Filter by a certain keyword inside a car's name. Provide a keyword that is found in a in-game car's name after that.
                        \`remove / disable\` - Remove a filter criteria. Provide a filter category and a value (if necessary) after that.`,
                author: message.author
            }).displayClosest(criteria);
            return errorMessage.sendMessage();
    }

    return [filter, successMessage];

    function format(criteria) {
        return criteria.toLowerCase().replace("type", "Type").replace("tcount", "tCount").replace("style", "Style").replace("year", "Year").replace("pos", "Pos").replace("prize", "Prize").replace("stock", "Stock").replace("upgrade", "Upgrade").replace("max", "Max").replace("owned", "Owned");
    }
}

module.exports = editFilter;