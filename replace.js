"use strict";

const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith('.json'));
const trackFiles = fs.readdirSync("./commands/tracks").filter(file => file.endsWith('.json'));

for (let file of carFiles) {
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("c")) {
        let id = `00000${carFiles.length}`.slice(-6);
        fs.renameSync(`./commands/cars/${file}`, `./commands/cars/c${id}.json`);
        console.log(`c${id} - has been assigned`);
    }
}

for (let file of packFiles) {
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("p")) {
        let id = `00000${packFiles.length}`.slice(-6);
        fs.renameSync(`./commands/packs/${file}`, `./commands/packs/p${id}.json`);
        console.log(`p${id} - has been assigned`);
    }
}

for (let file of trackFiles) {
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("t")) {
        let id = `00000${trackFiles.length}`.slice(-6);
        fs.renameSync(`./commands/tracks/${file}`, `./commands/tracks/t${id}.json`);
        console.log(`t${id} - has been assigned`);
    }
}