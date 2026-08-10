export type MetaV15Mode = "pve" | "pvp" | "guild";
export type MetaV15Confidence = "definitive" | "medium" | "low";
export type MetaV15PairRunes = readonly [string, string];

export interface MetaV15Pair {
  runes: MetaV15PairRunes;
  confidence: MetaV15Confidence;
  note?: string;
}

export interface MetaV15SpecialRune {
  runeId: string;
  label: string;
  note: string;
}

export interface MetaV15ConditionalPair {
  runes: MetaV15PairRunes;
  label: string;
  note: string;
}

const pair = (first: string, second: string, confidence: MetaV15Confidence, note?: string): MetaV15Pair => ({
  runes: [first, second],
  confidence,
  note,
});

const allModes = (value: MetaV15Pair): Record<MetaV15Mode, MetaV15Pair> => ({ pve: value, pvp: value, guild: value });

// v1.5 deliberately names exactly one two-rune target for every mode. Confidence is
// mode-specific: a fixed recommendation can still be marked for controlled testing.
export const META_V15_PAIRS: Record<string, Record<MetaV15Mode, MetaV15Pair>> = {
  "super-graviton": allModes(pair("bind", "imperfect-spell", "definitive", "Mastery remains the next-best 5/6 fallback when Imperfect Spell is unavailable.")),
  "ghost-ninja": {
    pve: pair("bloodlust", "slayer", "definitive"),
    pvp: pair("amplification", "slayer", "definitive", "Amplification strengthens Execution's repeat chain and its level-19 scaling; Focus remains the single-target alternative."),
    guild: pair("focus", "slayer", "definitive", "Focus assumes the Guild target is single-target eligible."),
  },
  "dr-pulse": {
    pve: pair("smite", "mana-harvest", "definitive", "Best when Pulse arrives early enough to stack Mana Harvest. Magic remains the 5/6 late-summon fallback."),
    pvp: pair("smite", "magic", "definitive", "Reliable 5.5/6 pair for Pulse's drone-carried basic attacks and complete Magic DMG kit."),
    guild: pair("smite", "hunter", "definitive", "Reliable 5.5/6 pair covering Pulse's drone basic attacks and complete boss-damage kit."),
  },
  "top-vayne": allModes(pair("iron-body", "focused-aim", "definitive", "End of Days is an attack-speed and arrow-stack state, so Iron Body boosts Vayne's physical kit without reducing the final arrow detonation.")),
  "primeval-bomba": allModes(pair("iron-body", "strength", "definitive", "Reliable physical-damage pair for Shockwave, Slam, Uppercut, and Power Unleashed. Focused Aim is a positional 5/6 option, not the default.")),
  "queen-coldy": allModes(pair("mastery", "imperfect-spell", "definitive", "Maximum control pair: both runes increase Glacial Cataclysm and Deep Freeze activation, accelerate Frost stacking, and improve freeze uptime. Imperfect Spell's damage penalty is acceptable for Coldy's support role.")),
  "i-am-meow": {
    pve: pair("magic", "mana", "definitive", "Reliable full-kit Magic DMG and MP regeneration pair. Accumulation is not BiS because I Am Meow is commonly summoned around waves 60-70, leaving too little time to build stacks."),
    pvp: pair("magic", "mana", "definitive", "Reliable non-stacking pair for I Am Meow's complete Magic DMG kit and repeated ultimate use. Mastery remains the 5/6 proc-focused fallback."),
    guild: pair("hunter", "mana", "definitive", "Boss damage plus MP regeneration for repeated ultimate use. Magic remains the reliable 5/6 full-kit fallback."),
  },
  "blob-squad": {
    pve: pair("wave", "magic", "definitive", "Wave improves every area-damage source while Magic covers Red Blob, Green Blob, and Three as One. Blob Squad itself arrives too late and earns too few kills for scaling runes to overtake this reliable pair."),
    pvp: pair("wave", "magic", "definitive", "Reliable non-stacking pair: Wave covers the complete area-damage kit and Magic improves the three dominant Magic DMG sources."),
    guild: pair("hunter", "magic", "definitive", "Hunter multiplies the complete mixed-damage kit against the boss while Magic improves Red Blob, Green Blob, and Three as One. Battle remains the 5/6 ultimate-only fallback."),
  },
  "dark-lord-dragon": {
    pve: pair("mana-harvest", "mastery", "definitive", "Locked 4.5/6 scaling pair. Use Mastery + Magic when Dragon arrives too late to build Mana Harvest."),
    pvp: pair("mastery", "magic", "definitive", "Locked 5.5/6 pair: Mastery accelerates both proc skills and Flame Marks while Magic covers the complete damage kit."),
    guild: pair("hunter", "magic", "definitive", "Locked 5.5/6 broad boss and Magic DMG pair."),
  },
  "demon-monopoly": {
    pve: pair("mastery", "fortune", "definitive", "Long PvE runs reward early Monopoly ultimates with Fortune's Luck Stone value."),
    pvp: pair("mastery", "imperfect-spell", "definitive", "Shorter mode: prioritize Demon Stone generation and activation rate."),
    guild: pair("mastery", "imperfect-spell", "definitive", "Shorter mode: prioritize Demon Stone generation and activation rate."),
  },
  "grand-mama": {
    pve: pair("barrier", "imperfect-spell", "definitive", "Reliable protection and Mark of the Dead activation; Time Reversal is situational only."),
    pvp: pair("barrier", "imperfect-spell", "definitive", "Reliable protection and Mark of the Dead activation; Time Reversal is situational only."),
    guild: pair("barrier", "imperfect-spell", "definitive", "Reliable protection and Mark of the Dead activation; Time Reversal is situational only."),
  },
  "reaper-frog": {
    pve: pair("mana-harvest", "amplification", "definitive", "Long-run PvE pair built around Mana Harvest scaling and Chain Lightning's high multi-target skill damage."),
    pvp: pair("amplification", "magic", "definitive", "Broad Magic DMG and skill-damage pair for Death Lightning, Chain Lightning, and Death Touch."),
    guild: pair("hunter", "time-reversal", "definitive", "Boss damage plus a 16% chance to repeat the full Death Touch zone. Hunter + Amplification remains the close 5.5/6 fallback."),
  },
  "ace-bat-man": {
    pve: pair("bloodlust", "wave", "definitive"),
    pvp: pair("strength", "undying-oath", "definitive", "Locked short-mode Pitcher pair. Batter remains the preferred boss form when available."),
    guild: pair("strength", "hunter", "definitive", "Locked reliable physical and boss-damage pair for Pitcher. Batter remains the preferred boss form."),
  },
  "ace-bat-man-batter": {
    pve: pair("bloodlust", "battle", "definitive"),
    pvp: pair("focus", "battle", "definitive"),
    guild: pair("focus", "battle", "definitive"),
  },
  "great-kitty-mage": allModes(pair("mastery", "imperfect-spell", "definitive", "Support activation pair; Great Kitty Mage has no Limit Break.")),
  "colony-tar": {
    pve: pair("wave", "strength", "definitive", "Tar usually transforms too late for Bloodlust to stack reliably. Strength improves the complete physical kit; Amplification remains the 5/6 skill-damage fallback."),
    pvp: pair("strength", "amplification", "definitive", "Strength covers Tar's physical kit while Amplification improves the repeated Sweep and Contaminant damage loop."),
    guild: pair("hunter", "amplification", "definitive", "Reliable boss and skill-damage pair; Battle remains the 5/6 Abyss-focused fallback."),
  },
  "sage-kun": {
    pve: pair("magic", "mastery", "definitive", "Locked 5.5/6 pair. Magic covers Sage Kun's complete Magic DMG kit while Mastery increases both Flame Shot and Flame Acceleration activation."),
    pvp: pair("magic", "mastery", "definitive", "Locked 5.5/6 pair. Reliable full-kit Magic DMG plus more Flame Shot and Flame Acceleration activations."),
    guild: pair("hunter", "magic", "definitive", "Reliable boss-damage and full-kit Magic DMG pair."),
  },
  "genie-wiz-zap": {
    pve: pair("magic", "focus", "definitive", "Locked 5.5/6 pair. Genie usually arrives too late for scaling runes; Magic and Focus strengthen the continuous single-target laser that produces most of his damage."),
    pvp: pair("magic", "focus", "definitive", "Magic covers the complete kit while Focus strengthens the dominant continuously charged single-target laser."),
    guild: pair("hunter", "focus", "definitive", "Boss and single-target multipliers directly strengthen Genie's dominant continuous laser. Hunter + Magic remains the broad 5.5/6 fallback."),
  },
  "azure-dragon-taoist": {
    pve: pair("magic", "amplification", "definitive", "Magic covers Azure's complete damage kit while Amplification strengthens Billowing Wind, Cutting Gust, and Dragon Twister."),
    pvp: pair("magic", "mastery", "definitive", "Locked 5.5/6 pair. Magic covers the complete kit while Mastery increases both damage-proc activation rates."),
    guild: pair("hunter", "magic", "definitive", "Reliable boss-damage and full-kit Magic DMG pair."),
  },
  "evergreen-verdee": allModes(pair("speed", "amplification", "definitive", "Attack speed produces more Mini and King Treeees from the attack-count loop; Amplification improves the repeated Treeee and Bloom skill damage. Battle remains a 5/6 King Treeee ultimate alternative.")),
  "noisy-penguin-musician": {
    pve: pair("mastery", "scatter-shot", "definitive", "Scatter Shot enlarges Penguin's ally attack-speed buff area; Imperfect Spell remains the 5/6 activation fallback."),
    pvp: pair("mastery", "barrier", "definitive", "Barrier protects the support unit from early harmful effects in PvP; Imperfect Spell remains the activation fallback."),
    guild: pair("mastery", "scatter-shot", "definitive", "Scatter Shot enlarges Penguin's ally attack-speed buff area; Imperfect Spell remains the 5/6 activation fallback."),
  },
  "awakened-hailey": {
    pve: pair("mastery", "magic", "definitive", "Reliable full-kit pair across normal Hailey levels. Onslaught is retained only as a conditional below-level-23 experiment."),
    pvp: pair("mastery", "magic", "definitive", "Reliable full-kit pair across normal Hailey levels. Onslaught is retained only as a conditional below-level-23 experiment."),
    guild: pair("mastery", "hunter", "definitive", "Activation rate plus reliable boss damage. Onslaught is retained only as a conditional below-level-23 experiment."),
  },
  "chrono-ato": allModes(pair("mastery", "imperfect-spell", "definitive", "Reliable physical-team buff activation; Scatter Shot and Time Reversal remain close 5/6 alternatives.")),
  "captain-roka": {
    pve: pair("amplification", "slayer", "definitive", "Reliable skill-damage pair from the moment Roka transforms. Bloodlust stacks too late to be a default; Strength and Battle remain 5/6 alternatives."),
    pvp: pair("focus", "slayer", "medium", "Focus is the preferred PvP damage-type theory; Amplification remains the 5/6 fallback until Roka's skill classifications are proven."),
    guild: pair("hunter", "slayer", "definitive", "Reliable boss-damage pair."),
  },
  "boss-birdraw": {
    pve: pair("mastery", "magic", "definitive", "Mastery drives the Hard Shuffle, Prime Circle, Trick Token and Finale feedback loop; Magic covers every Magic DMG source."),
    pvp: pair("mastery", "magic", "definitive", "Reliable activation and full-kit Magic DMG pair without depending on early scaling."),
    guild: pair("mastery", "hunter", "definitive", "Mastery sustains the Trick Token and Finale loop while Hunter applies reliable boss damage."),
  },
  "giga-chad": allModes(pair("mastery", "imperfect-spell", "definitive", "Mastery and Imperfect Spell create the most Enhanced Signal activation checks. Infection Shell's stored-damage result is no longer improved by normal rune damage buffs; Speed + Mastery remains the less-effective fallback.")),
  "savior-ray": {
    pve: pair("strength", "wave", "definitive", "Ray's physical area kit does not collect enough reliable Bloodlust kills. Strength covers the complete kit while Wave covers Piercing Blades, Sword Aura, and Rain of Blades."),
    pvp: pair("strength", "wave", "definitive", "Reliable physical and area-damage pair; Focused Aim remains a positional 5/6 option."),
    guild: pair("hunter", "strength", "definitive", "Hunter and Strength apply across Ray's complete physical boss-damage kit."),
  },
  "knight-lancelot": {
    pve: pair("mastery", "magic", "definitive", "Mastery creates more Sword of Judgment casts and Max-HP triggers; at LB23+ it also creates more Flame Pillars, and at LB24+ improves the uptime of the 15% nearby-allies Magic-DMG aura. Magic covers Lancelot's complete normal damage kit."),
    pvp: pair("mastery", "magic", "definitive", "Reliable activation and full-kit Magic DMG pair; LB23-25 strengthens this same pair rather than creating a new rune breakpoint."),
    guild: pair("mastery", "hunter", "definitive", "Locked 5.5/6 safe pair. Mastery creates additional Max-HP triggers and, at LB23+, Flame Pillars; at LB24+ it also improves the 15% nearby-allies Magic-DMG aura uptime. Hunter improves normal boss damage; Time Reversal remains an unproven 5.5/6 alternative."),
  },
};

export const META_V15_SPECIAL_RUNES: Record<string, Partial<Record<MetaV15Mode, MetaV15SpecialRune>>> = {
  "awakened-hailey": {
    pve: {
      runeId: "onslaught",
      label: "X/6",
      note: "Experimental below-level-23 option only. It may outperform a normal rune with multiple Kitty Mages, very high Mana regeneration and attack speed, but only if disabling Flare produces more Solar Ray and Big Bang damage. Levels 23-25 substantially improve Flare and are not recommended for this theory.",
    },
    pvp: {
      runeId: "onslaught",
      label: "X/6",
      note: "Experimental below-level-23 option only. Use only with unusually high Mana, attack-speed and Kitty support after confirming that disabling Flare improves the complete fight result.",
    },
    guild: {
      runeId: "onslaught",
      label: "X/6",
      note: "Experimental below-level-23 option only. Use only with unusually high Mana, attack-speed and Kitty support after confirming that disabling Flare improves boss damage; levels 23-25 make Flare much more valuable.",
    },
  },
  "reaper-frog": {
    guild: {
      runeId: "undying-oath",
      label: "X/6",
      note: "Luck-based Guild Raid tip. A 25% revive with +80% Skill DMG can be extremely powerful, but use it only as a gamble until the post-revive buff carryover into Dian is fully confirmed.",
    },
  },
  "grand-mama": {
    guild: {
      runeId: "execution",
      label: "X/6",
      note: "Guild boss-only finisher. Consider only when the team can defeat the boss in one round; otherwise Execution has no practical value.",
    },
  },
  "primeval-bomba": {
    pvp: {
      runeId: "immobility",
      label: "X/6",
      note: "PvP-only placement option. Use only when Bomba can remain safely fixed; do not use it as a Guild default because repositioning may be necessary to keep him alive.",
    },
    guild: {
      runeId: "immobility",
      label: "X/6",
      note: "Guild placement option only. It can add damage in a completely safe fixed position, but moving to prevent Bomba's death takes priority.",
    },
  },
};

export const META_V15_CONDITIONAL_PAIRS: Record<string, Partial<Record<MetaV15Mode, MetaV15ConditionalPair[]>>> = {
  "primeval-bomba": {
    pve: [{
      runes: ["chain", "haste"],
      label: "5.5/6 conditional pair",
      note: "Use only when both runes are available and Bomba has reliable critical-hit support. The pair can improve Power Unleashed uptime; neither rune is a standalone replacement for Strength.",
    }],
    pvp: [{
      runes: ["chain", "haste"],
      label: "5.5/6 conditional pair",
      note: "Use only when both runes are available and Bomba has reliable critical-hit support. The pair can improve Power Unleashed uptime; neither rune is a standalone replacement for Strength.",
    }],
    guild: [{
      runes: ["chain", "haste"],
      label: "5.5/6 conditional pair",
      note: "Use only when both runes are available and Bomba has reliable critical-hit support. The pair can improve Power Unleashed uptime; neither rune is a standalone replacement for Strength.",
    }],
  },
};

const immobilityRisk = { pve: 2, pvp: 1, guild: 2 } satisfies Partial<Record<MetaV15Mode, number>>;
const immobilityExcluded = { pve: 0, pvp: 0, guild: 0 } satisfies Partial<Record<MetaV15Mode, number>>;

export const META_V15_RATING_OVERRIDES: Record<string, Record<string, Partial<Record<MetaV15Mode, number>>>> = {
  "super-graviton": { immobility: immobilityExcluded },
  "ghost-ninja": { immobility: immobilityRisk },
  "top-vayne": { immobility: immobilityExcluded },
  "primeval-bomba": { immobility: immobilityExcluded },
  "queen-coldy": { immobility: immobilityRisk },
  "i-am-meow": {
    immobility: immobilityRisk,
    accumulation: { pve: 3, pvp: 2, guild: 2 },
    mastery: { pve: 5, pvp: 5, guild: 5 },
    magic: { guild: 5 },
  },
  "dr-pulse": {
    immobility: immobilityRisk,
    magic: { pve: 5, pvp: 5.5 },
    smite: { pvp: 5.5, guild: 5.5 },
    hunter: { guild: 5.5 },
    "focused-aim": { pvp: 5 },
    mana: { pve: 5, pvp: 5, guild: 5 },
  },
  "dark-lord-dragon": {
    immobility: immobilityRisk,
    "mana-harvest": { pve: 4.5 },
    mastery: { pve: 4.5, pvp: 5.5, guild: 5 },
    magic: { pve: 5, pvp: 5.5, guild: 5.5 },
    hunter: { guild: 5.5 },
    mana: { pve: 5, pvp: 5, guild: 5 },
    amplification: { pve: 5, pvp: 5, guild: 5 },
  },
  "great-kitty-mage": {
    immobility: immobilityExcluded,
    mana: { pve: 5, pvp: 5, guild: 5 },
  },
  "blob-squad": {
    immobility: immobilityRisk,
    battle: { pve: 5, pvp: 5, guild: 5 },
  },
  "noisy-penguin-musician": {
    immobility: immobilityExcluded,
    "imperfect-spell": { pve: 5, pvp: 5, guild: 5 },
  },
  "chrono-ato": {
    immobility: immobilityExcluded,
    "time-reversal": { pve: 5, pvp: 5, guild: 5 },
  },
  "captain-roka": {
    immobility: immobilityRisk,
    strength: { pve: 5 },
    battle: { pve: 5 },
    focus: { pvp: 5 },
    slayer: { pvp: 5 },
  },
  "colony-tar": {
    immobility: immobilityRisk,
    amplification: { pve: 5 },
    bloodlust: { pve: 4 },
  },
  "savior-ray": {
    immobility: immobilityRisk,
    amplification: { pve: 5, pvp: 5, guild: 5 },
    battle: { pve: 5, pvp: 5, guild: 5 },
    "focused-aim": { pvp: 5, guild: 5 },
    bloodlust: { pve: 3 },
  },
  "reaper-frog": {
    immobility: immobilityRisk,
    magic: { pve: 5 },
    amplification: { guild: 5.5 },
  },
  "sage-kun": {
    immobility: immobilityRisk,
    magic: { pve: 5.5, pvp: 5.5 },
    mastery: { pve: 5.5, pvp: 5.5 },
  },
  "azure-dragon-taoist": {
    immobility: immobilityRisk,
    magic: { pvp: 5.5 },
    mastery: { pvp: 5.5 },
    amplification: { pvp: 5, guild: 5 },
  },
  "genie-wiz-zap": {
    immobility: immobilityRisk,
    magic: { pve: 5.5, guild: 5.5 },
    focus: { pve: 5.5 },
    amplification: { pve: 5, pvp: 5, guild: 5 },
    "focused-aim": { pvp: 5.5, guild: 5.5 },
  },
  "awakened-hailey": {
    immobility: immobilityRisk,
    amplification: { pve: 5.5, pvp: 5.5, guild: 5.5 },
    magic: { guild: 5.5 },
    battle: { pve: 5, pvp: 5, guild: 5 },
    wave: { pve: 5, pvp: 5 },
  },
  "boss-birdraw": {
    immobility: immobilityRisk,
    amplification: { pve: 5, pvp: 5, guild: 5 },
    mana: { pve: 5, pvp: 5, guild: 5 },
    wave: { pve: 5, pvp: 5 },
    magic: { guild: 5.5 },
  },
  "knight-lancelot": {
    immobility: immobilityExcluded,
    amplification: { pve: 5.5, pvp: 5.5, guild: 5 },
    mastery: { guild: 5.5 },
    hunter: { guild: 5.5 },
    magic: { guild: 5.5 },
    "time-reversal": { guild: 5.5 },
    mana: { pve: 5, pvp: 5, guild: 5 },
  },
  "demon-monopoly": { immobility: immobilityExcluded },
  "grand-mama": { immobility: immobilityExcluded },
  "ace-bat-man": { immobility: immobilityRisk },
  "ace-bat-man-batter": { immobility: immobilityRisk },
  "evergreen-verdee": { immobility: immobilityRisk },
  "giga-chad": { immobility: immobilityExcluded },
};
