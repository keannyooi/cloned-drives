"use strict";

/**
 * IMAGE CACHE — the fix for "cd-rr is slow" (2026-10-27 diagnosis).
 *
 * Every race used to download the track background and BOTH racehud PNGs
 * from file.garden: 1.6–4.6 MB each, ~2500 px wide, ~1.3–1.6 s apiece, only
 * to be drawn at 500×312 (HUD) or 674×379 (background). The player's own hand
 * HUD was re-downloaded on every single race.
 *
 * This module keeps each image ALREADY SCALED to the size it is drawn at, so
 * a cached HUD is ~0.6 MB instead of the ~15 MB a decoded 2500 px image
 * takes. Drawing a cached canvas at the same size is a 1:1 copy, so the
 * output is pixel-identical to drawing the original straight onto the
 * target.
 *
 *   - LRU by bytes (BUDGET_BYTES). The Map's insertion order is the LRU order.
 *   - Concurrent requests for the same image share one download.
 *   - A caller's own timeout does NOT cancel the download: it keeps going in
 *     the background and fills the cache, so the next race gets it instantly.
 *   - Failures are never cached; the next request retries.
 *
 * Returned canvases are SHARED. Use them only as a drawImage source — never
 * draw onto one or hand it to code that does.
 *
 * Keys are the image URL, so a Discord message-link image whose signed URL is
 * refreshed (discordImageLinks.js) simply misses once and ages the old entry out.
 */

const { loadImage, createCanvas } = require("@napi-rs/canvas");

// Canvas pixels live in native (Skia) memory, outside the V8 heap — an
// oversized cache is a silent container kill, and PebbleHost does not restart
// the process. The container has 3.5 GB and the bot peaks around 500 MB, so
// 1 GB (~1,700 HUDs, ~20% of the library) leaves ~2 GB of headroom. Hand HUDs
// hit at any size; the budget mostly buys random-opponent hits.
// IMAGE_CACHE_MB overrides.
const BUDGET_BYTES = (Number(process.env.IMAGE_CACHE_MB) || 1024) * 1024 * 1024;
const DOWNLOAD_CEILING_MS = 30000;       // a hung download must not pin its in-flight slot forever

const entries = new Map();   // key -> { canvas, bytes }
const inFlight = new Map();  // key -> Promise<Canvas>
let usedBytes = 0;
const stats = { hits: 0, misses: 0, shared: 0, failures: 0, evictions: 0 };

function store(key, canvas, bytes) {
    if (bytes > BUDGET_BYTES) return;
    entries.set(key, { canvas, bytes });
    usedBytes += bytes;
    for (const [oldKey, entry] of entries) {
        if (usedBytes <= BUDGET_BYTES) break;
        entries.delete(oldKey);
        usedBytes -= entry.bytes;
        stats.evictions++;
    }
}

function download(src, width, height, key) {
    let ceiling;
    const promise = Promise.race([
        loadImage(src),
        new Promise((_, reject) => {
            ceiling = setTimeout(() => reject(new Error(`download exceeded ${DOWNLOAD_CEILING_MS / 1000}s`)), DOWNLOAD_CEILING_MS);
        })
    ])
        .then(image => {
            const canvas = createCanvas(width, height);
            canvas.getContext("2d").drawImage(image, 0, 0, width, height);
            store(key, canvas, width * height * 4);
            return canvas;
        })
        .catch(error => {
            stats.failures++;
            throw error;
        })
        .finally(() => {
            clearTimeout(ceiling);
            inFlight.delete(key);
        });
    inFlight.set(key, promise);
    return promise;
}

/**
 * The image at `src` (URL or local path), scaled to width×height.
 * Rejects if the image cannot be loaded; callers keep their own timeout.
 * @returns {Promise<Canvas>} shared canvas — read-only (drawImage source)
 */
function getScaledImage(src, width, height) {
    const key = `${width}x${height}|${src}`;
    const cached = entries.get(key);
    if (cached) {
        stats.hits++;
        entries.delete(key);       // refresh LRU position
        entries.set(key, cached);
        return Promise.resolve(cached.canvas);
    }
    const pending = inFlight.get(key);
    if (pending) {
        stats.shared++;
        return pending;
    }
    stats.misses++;
    return download(src, width, height, key);
}

function clear() {
    entries.clear();
    usedBytes = 0;
}

function imageCacheStats() {
    return { ...stats, entries: entries.size, usedMB: usedBytes / 1048576, budgetMB: BUDGET_BYTES / 1048576, inFlight: inFlight.size };
}

module.exports = { getScaledImage, clear, imageCacheStats };
