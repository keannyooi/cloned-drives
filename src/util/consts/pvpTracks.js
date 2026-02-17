"use strict";

/**
 * PvP Track Pools
 * 
 * Predefined track sets that rotate each season.
 * Each pool defines:
 * - Allowed surfaces
 * - Weather options and weights
 * - Specific track IDs (optional - if not set, uses all tracks matching surfaces)
 */

// =============================================================================
// TRACK POOLS
// =============================================================================

const TRACK_POOLS = {
    /**
     * Asphalt Pool - Street and circuit racing
     */
    asphalt: {
        id: "asphalt",
        name: "Asphalt Legends",
        description: "Streets, circuits, and drag strips",
        surfaces: ["Asphalt", "Track", "Drag"],
        weather: ["Sunny", "Rainy"],
        weatherWeights: {
            Sunny: 0.7,
            Rainy: 0.3
        },
        // Optional: specific track IDs. If null, uses all tracks matching surfaces.
        specificTracks: null
        // Example with specific tracks:
        // specificTracks: ["t00001", "t00005", "t00010", "t00015", "t00020", ...]
    },
    
    /**
     * Off-Road Pool - Dirt, gravel, mud
     */
    offroad: {
        id: "offroad",
        name: "Off-Road Warriors",
        description: "Dirt, gravel, and rough terrain",
        surfaces: ["Gravel", "Dirt", "Sand"],
        weather: ["Sunny", "Rainy"],
        weatherWeights: {
            Sunny: 0.6,
            Rainy: 0.4
        },
        specificTracks: null
    },
    
    /**
     * Winter Pool - Snow and ice
     */
    winter: {
        id: "winter",
        name: "Winter Challenge",
        description: "Snow and ice conditions",
        surfaces: ["Snow", "Ice"],
        weather: ["Sunny"], // No rain on snow/ice
        weatherWeights: {
            Sunny: 1.0
        },
        specificTracks: null
    },
   
    /**
     * City Pool - Medium and twisty focus
     */
    city: {
        id: "city",
        name: "City Tourer",
        description: "City Street based racing",
        surfaces: ["Asphalt"], // only city tracks
        weather: ["Sunny"], // No rain on snow/ice
        weatherWeights: {
            Sunny: 1.0
        },
        specificTracks: ["t00113", "t00192", "t00115", "t00029", "t00128", "t00023", "t00111", "t00025", "t00094", "t00130", "t00129"]
    },
   
    /**
     * Mixed Pool - All surfaces
     */
    mixed: {
        id: "mixed",
        name: "Mixed Masters",
        description: "All surfaces - true versatility",
        surfaces: ["Asphalt", "Track", "Drag", "Gravel", "Dirt", "Snow", "Ice", "Sand"],
        weather: ["Sunny", "Rainy"],
        weatherWeights: {
            Sunny: 0.65,
            Rainy: 0.35
        },
        specificTracks: null
    },
    
    /**
     * China Pool - 2026 YOTH
     */
    china: {
        id: "china",
        name: "Shanghai Showcase",
        description: "Travel China and dominate",
        surfaces: ["Asphalt", "Track", "Gravel", "Dirt"],
        weather: ["Rainy","Sunny"],
        weatherWeights: {
            Sunny: 0.9,
            Rainy: 0.1
        },
        specificTracks: ["t00211", "t00213", "t00214", "t00215", "t00217", "t00219", "t00220", "t00222", "t00224"]
    },
    
    /**
     * Speed Demons Pool - Drag and high-speed
     */
    speeddemons: {
        id: "speeddemons",
        name: "Speed Demons",
        description: "Drag strips and high-speed circuits",
        surfaces: ["Drag", "Track"],
        weather: ["Sunny", "Rainy"],
        weatherWeights: {
            Sunny: 0.8,
            Rainy: 0.2
        },
        specificTracks: null
    },
    
    /**
     * Rally Pool - Classic rally surfaces
     */
    rally: {
        id: "rally",
        name: "Rally Champions",
        description: "Gravel, dirt, and snow stages",
        surfaces: ["Gravel", "Dirt", "Snow"],
        weather: ["Sunny", "Rainy"],
        weatherWeights: {
            Sunny: 0.5,
            Rainy: 0.5
        },
        specificTracks: null
    },
    
    /**
     * Extreme Pool - Challenging conditions
     */
    extreme: {
        id: "extreme",
        name: "Extreme Challenge",
        description: "Ice, sand, and difficult terrain",
        surfaces: ["Ice", "Sand", "Snow"],
        weather: ["Sunny"],
        weatherWeights: {
            Sunny: 1.0
        },
        specificTracks: null
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a track pool by ID
 */
function getTrackPool(poolID) {
    return TRACK_POOLS[poolID] || TRACK_POOLS.mixed;
}

/**
 * Get all available track pools
 */
function getAllTrackPools() {
    return Object.values(TRACK_POOLS);
}

/**
 * Get track pool names for display
 */
function getTrackPoolNames() {
    return Object.entries(TRACK_POOLS).map(([id, pool]) => ({
        id,
        name: pool.name,
        description: pool.description
    }));
}

/**
 * Check if a surface supports rainy weather
 */
function surfaceSupportsRain(surface) {
    const rainSurfaces = ["Asphalt", "Track", "Drag", "Gravel", "Dirt"];
    return rainSurfaces.includes(surface);
}

/**
 * Validate weather for a surface (prevents invalid combos like "Rainy Snow")
 */
function validateWeatherForSurface(weather, surface) {
    if (weather === "Rainy" && !surfaceSupportsRain(surface)) {
        return "Sunny";
    }
    return weather;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    TRACK_POOLS,
    getTrackPool,
    getAllTrackPools,
    getTrackPoolNames,
    surfaceSupportsRain,
    validateWeatherForSurface
};
