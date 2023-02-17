"use strict";

const { readdirSync, renameSync, readFileSync, writeFileSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith('.json'));
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith('.json'));
const trackFiles = readdirSync("./src/tracks").filter(file => file.endsWith('.json'));

const totalCarIDs = carFiles.filter(c => {
    let checkSampling = c.slice(1, 6);
    return !isNaN(checkSampling) && c.startsWith("c");
}).length;
let i = 1;
for (let file of carFiles) {
    let currentCar = readFileSync(`./src/cars/${file}`)
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("c")) {
        let id = `0000${totalCarIDs + i}`.slice(-5);
        renameSync(`./src/cars/${file}`, `./src/cars/c${id}.json`);
        i++;
        console.log(`c${id} - has been assigned`);
    }
}

const totalPackIDs = packFiles.filter(p => {
    let checkSampling = p.slice(1, 6);
    return !isNaN(checkSampling) && p.startsWith("p");
}).length;
i = 1;
for (let file of packFiles) {
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("p")) {
        let id = `0000${totalPackIDs + i}`.slice(-5);
        renameSync(`./src/packs/${file}`, `./src/packs/p${id}.json`);
        i++;
        console.log(`p${id} - has been assigned`);
    }
}

const totalTrackIDs = trackFiles.filter(t => {
    let checkSampling = t.slice(1, 6);
    return !isNaN(checkSampling) && t.startsWith("t");
}).length;
i = 1;
for (let file of trackFiles) {
    let checkSampling = file.slice(1, 6);
    if (isNaN(checkSampling) || !file.startsWith("t")) {
        let id = `0000${totalTrackIDs + i}`.slice(-5);
        renameSync(`./src/tracks/${file}`, `./src/tracks/t${id}.json`);
        i++;
        console.log(`t${id} - has been assigned`);
    }
}