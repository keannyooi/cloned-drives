"use strict";

function timeDisplay(interval) {
    let days = Math.floor(interval.length("days"));
    let hours = Math.floor(interval.length("hours") - (days * 24));
    let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
    let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
    return `\`${days}d ${hours}h ${minutes}m ${seconds}s\``;
}
module.exports = timeDisplay;