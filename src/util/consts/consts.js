"use strict";

const carSave = {
    "000": 1,
    "333": 0,
    "666": 0,
    "996": 0,
    "969": 0,
    "699": 0,
};

const consts = {
    carSave,
    starterGarage: [
        { carID: "c00552", upgrades: carSave },
        { carID: "c01032", upgrades: carSave },
        { carID: "c01134", upgrades: carSave },
        { carID: "c00943", upgrades: carSave },
        { carID: "c00335", upgrades: carSave }
    ],
    cardPlacement: [
        { x: 7, y: 3 },
        { x: 178, y: 3 },
        { x: 349, y: 3 },
        { x: 520, y: 3 },
        { x: 7, y: 143 },
        { x: 178, y: 143 },
        { x: 349, y: 143 },
        { x: 520, y: 143 }
    ],
    
	defaultWaitTime: 60000,
	defaultChoiceTime: 10000,
	defaultQTETime: 5000,
	hiloChoiceTime: 30000,  // 30 seconds for Hi-Lo rounds
    
    defaultPageLimit: 10,
    
    driveHierarchy: ["AWD", "4WD", "FWD", "RWD"],
    gcHierarchy: ["High", "Medium", "Low"],
    /**
     * weatherVars v2.0 - Scaled for new race formula
     * 
     * All penalties/bonuses scaled 2x to compensate for:
     * - Top Speed now ÷2 instead of ÷4.2 (+110% impact)
     * - Need tyre/drive advantages to remain relevant
     * 
     * Hierarchy reminder:
     * - Drive: AWD > 4WD > FWD > RWD (in adverse conditions)
     * - Tyres vary by surface (see comments)
     */
    weatherVars: {
        // ============================================
        // DRAG SURFACES
        // ============================================
        "Sunny Drag": {
            drivePen: 0,
            absPen: 0,
            tcsPen: 2,          // was 1
            tyrePen: {
                "Standard": 0,
                "Performance": 0,
                "All-Surface": 0,
                "Off-Road": 0,
                "Slick": 0,
                "Drag": -15     // was -7.5 (Drag tyres best here)
            }
        },
        "Rainy Drag": {
            drivePen: 4,        // was 2
            absPen: 0,
            tcsPen: 2,          // was 1
            tyrePen: {
                "Standard": 0,
                "Performance": 0,
                "All-Surface": 0,
                "Off-Road": 0,
                "Slick": 40,    // was 20
                "Drag": 140     // was 70
            }
        },
        
        // ============================================
        // TRACK SURFACES (racing circuits)
        // ============================================
        "Sunny Track": {
            drivePen: 0,
            absPen: 0,
            tcsPen: 0,
            tyrePen: {
                "Standard": 0,
                "Performance": 0,
                "All-Surface": 0,
                "Off-Road": 0,
                "Slick": -32,   // was -16 (Slick tyres best here)
                "Drag": 18      // was 9
            }
        },
        "Rainy Track": {
            drivePen: 8,        // was 4
            absPen: 2,          // was 1
            tcsPen: 2,          // was 1
            tyrePen: {
                // Hierarchy: Standard > All-Surface > Performance > Slick > Off-Road > Drag
                "Standard": 0,
                "Performance": 22,   // was 11
                "All-Surface": 10,   // was 5
                "Off-Road": 100,     // was 50
                "Slick": 80,         // was 40
                "Drag": 240          // was 120
            }
        },
        
        // ============================================
        // ASPHALT SURFACES (roads)
        // ============================================
        "Sunny Asphalt": {
            drivePen: 0,
            absPen: 0,
            tcsPen: 0,
            tyrePen: {
                "Standard": 0,
                "Performance": 0,
                "All-Surface": 0,
                "Off-Road": 0,
                "Slick": 0,
                "Drag": 10      // was 5
            }
        },
        "Rainy Asphalt": {
            drivePen: 8,        // was 4
            absPen: 2,          // was 1
            tcsPen: 2,          // was 1
            tyrePen: {
                // Hierarchy: Standard > All-Surface > Performance > Off-Road > Slick > Drag
                "Standard": 0,
                "Performance": 22,   // was 11
                "All-Surface": 10,   // was 5
                "Off-Road": 80,      // was 40
                "Slick": 100,        // was 50
                "Drag": 200          // was 100
            }
        },
        
        // ============================================
        // GRAVEL SURFACES
        // ============================================
        "Sunny Gravel": {
            drivePen: 4,        // was 2
            absPen: 0,
            tcsPen: 0,
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 35,   // was 17.5
                "All-Surface": -8,   // was -4
                "Off-Road": -9,      // was -4.5
                "Slick": 80,         // was 40
                "Drag": 200          // was 100
            }
        },
        "Rainy Gravel": {
            drivePen: 11,       // was 5.5
            absPen: 2.5,        // was 1.25
            tcsPen: 2.5,        // was 1.25
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 35,   // was 17.5
                "All-Surface": -11,  // was -5.5
                "Off-Road": -15,     // was -7.5
                "Slick": 85,         // was 42.5
                "Drag": 400          // was 200
            }
        },
        
        // ============================================
        // SAND SURFACES
        // ============================================
        "Sunny Sand": {
            drivePen: 11,       // was 5.5
            absPen: -2.5,       // was -1.25 (ABS bad on sand)
            tcsPen: -2.5,       // was -1.25 (TCS bad on sand)
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 101,  // was 50.5
                "All-Surface": -31,  // was -15.5
                "Off-Road": -41,     // was -20.5
                "Slick": 161,        // was 80.5
                "Drag": 1000         // was 500
            }
        },
        
        // ============================================
        // DIRT SURFACES
        // ============================================
        "Sunny Dirt": {
            drivePen: 14,       // was 7
            absPen: 3.5,        // was 1.75
            tcsPen: 3.5,        // was 1.75
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 40,   // was 20
                "All-Surface": -50,  // was -25
                "Off-Road": -66,     // was -33
                "Slick": 130,        // was 65
                "Drag": 1000         // was 500
            }
        },
        "Rainy Dirt": {
            drivePen: 17,       // was 8.5
            absPen: 5,          // was 2.5
            tcsPen: 5,          // was 2.5
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 60,   // was 30
                "All-Surface": -80,  // was -40
                "Off-Road": -120,    // was -60
                "Slick": 260,        // was 130
                "Drag": 1000         // was 500
            }
        },
        
        // ============================================
        // SNOW SURFACES
        // ============================================
        "Sunny Snow": {
            drivePen: 24,       // was 12
            absPen: 6,          // was 3
            tcsPen: 6,          // was 3
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 150,  // was 75
                "All-Surface": -40,  // was -20
                "Off-Road": -90,     // was -45
                "Slick": 850,        // was 425
                "Drag": 1400         // was 700
            }
        },
        
        // ============================================
        // ICE SURFACES
        // ============================================
        "Sunny Ice": {
            drivePen: 34,       // was 17
            absPen: 8.5,        // was 4.25
            tcsPen: 8.5,        // was 4.25
            tyrePen: {
                // Hierarchy: Off-Road > All-Surface > Standard > Performance > Slick > Drag
                "Standard": 0,
                "Performance": 250,  // was 125
                "All-Surface": -130, // was -65
                "Off-Road": -200,    // was -100
                "Slick": 1750,       // was 875
                "Drag": 1800         // was 900
            }
        },
        
        // ============================================
        // TEST TRACKS (special)
        // ============================================
        "TT OffRoad": {
            drivePen: 0,
            absPen: 0,
            tcsPen: 0,
            tyrePen: {
                // Pure off-road test - Off-Road tyres dominate
                "Standard": 0,
                "Performance": 200,  // was 100
                "All-Surface": -150, // was -75
                "Off-Road": -200,    // was -100
                "Slick": 800,        // was 400
                "Drag": 1400         // was 700
            }
        },
        "TT OnRoad": {
            // Pure road test - no penalties
            drivePen: 0,
            absPen: 0,
            tcsPen: 0,
            tyrePen: {
                "Standard": 0,
                "Performance": 0,
                "All-Surface": 0,
                "Off-Road": 0,
                "Slick": 0,
                "Drag": 0
            }
        }
    },
    
    adminRoleID: "711790752853655563",
    eventMakerRoleID: "917685033995751435",
    testerRoleID: "915846116656959538",
    sandboxRoleID: "1102267061796880384",
    
    bugReportsChannelID: "750304569422250064",
    currentEventsChannelID: "955467202138620014",
    currentOffersChannelID: "969786587191849011",
    dealershipChannelID: "995938671209500702",
    
    moneyEmojiID: "1162881967738601502",
    fuseEmojiID: "1162882165109964892",
    trophyEmojiID: "1162882347499262094",
    glofEmojiID: "967031943222923335",
    packEmojiID: "966972920687652885",
    blackMarketEmojiID: "1162936880048898059",
    bossEmojiID: "1162881924453371935",
    mysticEmojiID: "1162882081005764668",
    legendaryEmojiID: "1162882065017081897",
    epicEmojiID: "1162882032347644025",
    exoticEmojiID: "1162882048512491631",
    standardEmojiID: "1162882111448039434",
    rareEmojiID: "1162882097657155614",
    uncommonEmojiID: "1162882129273815140",
    commonEmojiID: "1162882014668668958",
    
    failedToLoadImageLink: "https://file.garden/ZSrBMiDRyR84aPJp/unknown.png"
}

module.exports = consts;