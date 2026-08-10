import type { MetaV15Mode, MetaV15PairRunes } from "./meta-v15";

export interface MetaV15Fallback {
  runes: MetaV15PairRunes;
  note: string;
}

export interface MetaV15BisGuide {
  why: string;
  bestFor: string;
  fallbacks: readonly MetaV15Fallback[];
  caution?: string;
}

const fallback = (first: string, second: string, note: string): MetaV15Fallback => ({
  runes: [first, second],
  note,
});

const guide = (
  why: string,
  bestFor: string,
  fallbacks: readonly MetaV15Fallback[],
  caution?: string,
): MetaV15BisGuide => ({ why, bestFor, fallbacks, caution });

const allModes = (value: MetaV15BisGuide): Record<MetaV15Mode, MetaV15BisGuide> => ({
  pve: value,
  pvp: value,
  guild: value,
});

// Player-facing explanations for every fixed v2.0.9 BiS target. Keep these
// separate from the optimizer inputs so copy changes cannot alter calculations.
export const META_V15_BIS_GUIDES: Record<string, Record<MetaV15Mode, MetaV15BisGuide>> = {
  "super-graviton": allModes(guide(
    "Bind reinforces Super Gravitation's control job, while Imperfect Spell increases how often its important control skills activate. The damage penalty is a small trade because the unit is selected for grouping and uptime rather than personal damage.",
    "Use this when Super Graviton is your dedicated crowd-control support and the team gains more from consistent grouping than from his own damage.",
    [
      fallback("bind", "mastery", "The cleanest replacement when Imperfect Spell is unavailable; it keeps the control theme but gives up some activation frequency."),
      fallback("mastery", "mana", "A broader cast-uptime option when control strength is already sufficient and MP flow is the limiting factor."),
    ],
  )),
  "ghost-ninja": {
    pve: guide(
      "Bloodlust can build through long waves and then multiply Ghost Ninja's physical damage, while Slayer improves the repeated Execution chain that drives his late-run value. The combination has the highest ceiling when kills are plentiful.",
      "Best in long PvE runs where Ghost Ninja is fielded early enough to collect kills and Execution can repeatedly jump through targets.",
      [
        fallback("amplification", "slayer", "More reliable from the moment he is summoned; choose it when Bloodlust will not have enough time to stack."),
        fallback("focus", "slayer", "A strong boss or isolated-target alternative when the encounter is effectively single target."),
      ],
    ),
    pvp: guide(
      "Amplification improves Execution and its repeat chain without asking for kill stacks, while Slayer scales the same signature skill. That immediate, skill-focused value is much more dependable in short PvP rounds than Bloodlust.",
      "Best for normal PvP boards where Execution can chain and you need full damage immediately after Ghost Ninja appears.",
      [
        fallback("focus", "slayer", "Use when the relevant target stays isolated and qualifies for Focus's single-target bonus."),
        fallback("bloodlust", "slayer", "Only worth considering in unusually long PvP rounds with enough confirmed kills to build stacks."),
      ],
    ),
    guild: guide(
      "Focus directly strengthens the single-target damage pattern expected against the Guild target, and Slayer improves Execution. The pair avoids slow stacking and concentrates both slots on the damage that matters in the boss window.",
      "Best when the Guild target is eligible for Focus and Ghost Ninja is being used as a direct single-target damage dealer.",
      [
        fallback("amplification", "slayer", "The safe swap if Focus eligibility or target isolation is uncertain; it keeps the core skill scaling."),
        fallback("hunter", "slayer", "A straightforward boss-damage alternative when Hunter is available at a stronger tier than Focus."),
      ],
      "Focus depends on the encounter counting as single target, so verify that condition before treating this as automatic.",
    ),
  },
  "dr-pulse": {
    pve: guide(
      "Smite scales the drone-carried basic-attack pattern and Mana Harvest can grow throughout a long run. Pulse gets value from both continuous drone attacks and repeated skill use, giving this pair a stronger long-run ceiling than two flat runes.",
      "Best when Dr. Pulse is summoned early enough for Mana Harvest to accumulate meaningful stacks before the difficult waves.",
      [
        fallback("smite", "magic", "The preferred late-summon fallback: immediate value for drone basics and the complete Magic DMG kit."),
        fallback("magic", "mana", "A stable full-kit and MP option when Mana Harvest cannot stack or Smite is unavailable."),
      ],
    ),
    pvp: guide(
      "Smite improves Pulse's drone-delivered basic attacks and Magic applies across the rest of his Magic DMG kit. Both bonuses work immediately, which is more reliable than a scaling setup in a short mode.",
      "Best for standard PvP where Pulse needs dependable damage as soon as he is placed and the drones remain active.",
      [
        fallback("focused-aim", "magic", "Useful when Pulse can maintain the positioning required by Focused Aim."),
        fallback("smite", "mana", "Trades some broad damage for more MP consistency when ultimate cadence is the bottleneck."),
      ],
    ),
    guild: guide(
      "Smite strengthens the drone basic attacks and Hunter multiplies damage into the boss. Together they cover Pulse's persistent attack pattern and the encounter-specific target without relying on stacks or positioning.",
      "Best for a stable Guild boss setup where Pulse's drones maintain contact throughout the damage window.",
      [
        fallback("hunter", "magic", "A broad boss-plus-Magic option if skill damage contributes more than drone basics in your setup."),
        fallback("smite", "mana", "Keeps the drone emphasis but trades boss scaling for steadier MP and ultimate use."),
      ],
    ),
  },
  "top-vayne": allModes(guide(
    "Iron Body boosts Vayne's physical kit while its ultimate penalty does not reduce the final End of Days arrow detonation. Focused Aim then adds a strong positional multiplier to the sustained arrow-stack sequence, so both slots improve the real damage pattern with unusually little downside.",
    "Best when Vayne can hold the required Focused Aim position and stay in End of Days long enough to build and release the arrow stack.",
    [
      fallback("iron-body", "strength", "The reliable no-positioning version; it loses Focused Aim's ceiling but keeps broad physical scaling."),
      fallback("strength", "focused-aim", "Use when Iron Body is unavailable; it preserves the positional multiplier with a smaller general physical boost."),
    ],
    "If your board cannot preserve Focused Aim positioning, use the Iron Body + Strength fallback instead of forcing it.",
  )),
  "primeval-bomba": allModes(guide(
    "Iron Body and Strength multiply Bomba's broad physical kit: Shockwave, Slam, Uppercut and Power Unleashed. The pair is always active and does not depend on critical-hit support, fixed placement or a specific skill classification.",
    "Best as the default Bomba build when you want reliable output across every part of the fight and cannot guarantee a specialized setup.",
    [
      fallback("strength", "focused-aim", "A good positional alternative when Bomba can consistently satisfy Focused Aim's placement requirement."),
      fallback("chain", "haste", "A conditional combo with higher Power Unleashed uptime when both runes and reliable critical-hit support are present."),
    ],
    "Chain + Haste works as a pair, not as two independent replacements. Immobility is also situational and should never prevent a necessary reposition.",
  )),
  "queen-coldy": allModes(guide(
    "Mastery and Imperfect Spell both increase activation frequency for Glacial Cataclysm and Deep Freeze. More activations accelerate Frost stacking and improve freeze uptime, which is Coldy's main team contribution; her personal damage is secondary to keeping enemies controlled.",
    "Best when Queen Coldy is assigned as a control support and the team benefits from maximum freeze consistency.",
    [
      fallback("mastery", "mana", "A comfortable cast-uptime fallback when Imperfect Spell is missing or its damage penalty is undesirable."),
      fallback("mastery", "barrier", "Use when Coldy is being disrupted or killed before she can maintain the control loop."),
    ],
  )),
  "i-am-meow": {
    pve: guide(
      "Magic improves the complete Magic DMG kit and Mana supports repeated ultimate use. Both work immediately, which matters because I Am Meow is often summoned around waves 60-70 and normally lacks enough remaining kills for Accumulation to catch up.",
      "Best for the common late PvE summon timing where consistency in the final waves matters more than theoretical stacking ceiling.",
      [
        fallback("mastery", "magic", "More proc-focused damage if MP is already fully covered by the team."),
        fallback("mastery", "mana", "More activations and MP comfort, trading away Magic's broad damage multiplier."),
      ],
      "Accumulation is only competitive with an unusually early summon and enough confirmed time to build stacks.",
    ),
    pvp: guide(
      "Magic covers the complete damage kit and Mana improves repeated ultimate access without requiring stacks. That makes the pair predictable in short rounds and resilient to variable summon timing.",
      "Best as the safe PvP default when you need immediate value and cannot assume a long stacking window.",
      [
        fallback("mastery", "magic", "The higher proc-frequency option when outside MP support already solves ultimate cadence."),
        fallback("mastery", "mana", "Choose for a support-leaning setup that values activations and MP over broad damage."),
      ],
    ),
    guild: guide(
      "Hunter applies a reliable boss multiplier while Mana keeps the ultimate cycling. This splits the two slots between encounter damage and resource uptime instead of investing in a stack mechanic that Guild timing cannot guarantee.",
      "Best for sustained Guild attempts where repeated ultimate use is valuable and MP is not already capped by team support.",
      [
        fallback("hunter", "magic", "More raw boss damage when MP generation is already sufficient."),
        fallback("magic", "mana", "The consistent non-Hunter fallback when rune tiers make broad Magic scaling more efficient."),
      ],
    ),
  },
  "blob-squad": {
    pve: guide(
      "Wave improves every area-damage source while Magic strengthens Red Blob, Green Blob and Three as One. Blob Squad arrives late and collects too few kills for scaling runes to reliably overtake these immediate multipliers.",
      "Best for late-wave PvE placement where the board supplies dense groups and Blob needs damage immediately.",
      [
        fallback("wave", "battle", "Leans harder into the ultimate when Three as One represents most of the important damage."),
        fallback("amplification", "magic", "A skill-focused alternative when area coverage is already excessive."),
      ],
    ),
    pvp: guide(
      "Wave covers Blob Squad's broad area pattern and Magic improves the three dominant Magic DMG sources. Neither rune needs kills or ramp time, so the pair is reliable even in short, volatile rounds.",
      "Best for standard PvP boards where multiple targets remain inside Blob's area effects.",
      [
        fallback("wave", "battle", "Use when ultimate burst decides the round more often than the regular blob skills."),
        fallback("amplification", "magic", "A narrower skill-damage setup when target grouping is poor."),
      ],
    ),
    guild: guide(
      "Hunter multiplies the complete mixed-damage kit against the boss, while Magic improves Red Blob, Green Blob and Three as One. This gives broad encounter coverage instead of overcommitting to only the ultimate.",
      "Best for normal Guild boss uptime where both regular blobs and Three as One contribute meaningful damage.",
      [
        fallback("hunter", "battle", "The ultimate-heavy alternative when Three as One dominates your measured damage."),
        fallback("hunter", "amplification", "A skill-focused boss pair when non-Magic skill sources matter more in your build."),
      ],
    ),
  },
  "dark-lord-dragon": {
    pve: guide(
      "Mana Harvest can scale over a long PvE run, while Mastery increases both proc-skill frequency and Flame Mark generation. The pair has the best ceiling only when Dragon is present early enough for the scaling slot to mature.",
      "Best for an early Dark Lord Dragon summon in long PvE where Mana Harvest receives a real stacking window.",
      [
        fallback("mastery", "magic", "The preferred late-summon pair; it gives immediate activation and full-kit Magic DMG."),
        fallback("magic", "amplification", "Reliable immediate damage when proc frequency is already high from other sources."),
      ],
      "Do not keep Mana Harvest by habit on a late Dragon; the immediate Mastery + Magic fallback is stronger when stacks cannot build.",
    ),
    pvp: guide(
      "Mastery accelerates both proc skills and Flame Mark production, while Magic applies to the complete damage kit. The two effects reinforce Dragon's core loop immediately without requiring a long round.",
      "Best for standard PvP where reliable Flame Mark and skill pressure matter from the moment Dragon is summoned.",
      [
        fallback("magic", "amplification", "More direct skill damage if proc activation is already saturated."),
        fallback("mastery", "mana", "A smoother resource-and-proc option when repeated casting is the constraint."),
      ],
    ),
    guild: guide(
      "Hunter supplies the boss multiplier and Magic covers Dragon's complete Magic DMG kit. It is a broad, stable damage pair that avoids depending on kill stacks or uncertain proc-only scaling.",
      "Best for Guild attempts where Dragon has steady boss contact and contributes through the full kit.",
      [
        fallback("mastery", "hunter", "Better when Flame Mark and proc frequency are the measured bottleneck."),
        fallback("hunter", "amplification", "A skill-focused boss alternative when skill hits dominate the damage breakdown."),
      ],
    ),
  },
  "demon-monopoly": {
    pve: guide(
      "Mastery accelerates Demon Stone generation and Fortune converts repeated early Monopoly ultimates into more Luck Stone value. Long PvE gives the economy effect enough time to compound, so utility can beat a second pure activation rune.",
      "Best when Demon Monopoly is summoned early and the run is long enough for extra Luck Stones to change later upgrades.",
      [
        fallback("mastery", "imperfect-spell", "The reliable activation pair when Monopoly arrives late or the economy window has already passed."),
        fallback("mastery", "mana", "A steadier ultimate-cadence option when MP, rather than proc chance, limits usage."),
      ],
    ),
    pvp: guide(
      "Mastery and Imperfect Spell maximize Demon Stone generation and activation frequency. PvP is too short for Fortune's economy to compound reliably, so immediate support uptime wins.",
      "Best when Monopoly's job is to produce Demon Stones as quickly and consistently as possible in a short round.",
      [
        fallback("mastery", "mana", "Use when MP flow limits ultimate frequency more than activation chance."),
        fallback("mastery", "barrier", "A survival-oriented fallback if control or early damage repeatedly stops Monopoly's support loop."),
      ],
    ),
    guild: guide(
      "Mastery and Imperfect Spell focus both rune slots on Demon Stone generation and activation rate. The boss window values immediate, repeatable support more than Fortune's delayed economic return.",
      "Best for normal Guild attempts where Monopoly supports the damage team through frequent Demon Stone activations.",
      [
        fallback("mastery", "mana", "Better when external activation bonuses are high but MP remains the limiting resource."),
        fallback("mastery", "fortune", "Only for unusually long formats where additional Luck Stone economy still has time to pay back."),
      ],
    ),
  },
  "grand-mama": allModes(guide(
    "Barrier keeps Grand Mama alive and protects the support cycle, while Imperfect Spell increases Mark of the Dead activation. The pairing balances survival and the debuff uptime the team actually needs instead of chasing her personal damage.",
    "Best when Grand Mama's main job is dependable Mark of the Dead support and incoming disruption is a real risk.",
    [
      fallback("mastery", "imperfect-spell", "More aggressive activation frequency when Grand Mama is already completely safe."),
      fallback("barrier", "time-reversal", "A higher-variance support option when repeating the key zone can outweigh lost consistency."),
    ],
    "Execution is only a Guild finisher when the team can actually end the boss in one round; otherwise it contributes no practical value.",
  )),
  "reaper-frog": {
    pve: guide(
      "Mana Harvest provides long-run scaling and Amplification improves Chain Lightning's high multi-target skill damage. Reaper Frog has enough repeated skill output in long waves for both pieces to grow into the late game.",
      "Best for early-to-mid PvE deployment with enough remaining waves for Mana Harvest to build.",
      [
        fallback("amplification", "magic", "Immediate broad damage when Reaper Frog arrives too late for Mana Harvest."),
        fallback("magic", "mana", "A stable full-kit and MP pair when stack conditions are poor."),
      ],
    ),
    pvp: guide(
      "Amplification strengthens Death Lightning, Chain Lightning and Death Touch, while Magic covers the broad Magic DMG kit. Both bonuses are immediate and do not depend on a long stacking window.",
      "Best for ordinary PvP where Reaper Frog needs reliable burst and zone damage as soon as combat starts.",
      [
        fallback("mastery", "magic", "Use when more skill activations outperform the extra damage per activation."),
        fallback("amplification", "mana", "A skill-and-resource option when ultimate cadence is inconsistent."),
      ],
    ),
    guild: guide(
      "Hunter multiplies boss damage and Time Reversal has a 16% chance to repeat the full Death Touch zone. The repeat can copy a much larger event than a flat damage increase, producing the best expected ceiling while Hunter preserves a reliable baseline.",
      "Best for Guild attempts where Death Touch lands for its full duration and some run-to-run variance is acceptable.",
      [
        fallback("hunter", "amplification", "The close, consistent fallback when you prefer guaranteed skill damage over Time Reversal variance."),
        fallback("hunter", "magic", "Broad boss and Magic DMG coverage when the full kit matters more than Death Touch alone."),
      ],
      "Undying Oath is a separate high-variance gamble until post-revive buff carryover into Dian is fully confirmed.",
    ),
  },
  "ace-bat-man": {
    pve: guide(
      "Bloodlust can stack through dense PvE waves and Wave improves Pitcher's area damage. The pair uses the mode's kill volume to build a higher ceiling than immediate flat physical bonuses.",
      "Best when Pitcher appears early enough to collect kills and cannot be switched to the stronger Batter boss form.",
      [
        fallback("strength", "wave", "Immediate physical and area damage when Bloodlust has too little time to stack."),
        fallback("bloodlust", "strength", "Use when kills are plentiful but area coverage is less important than broad physical scaling."),
      ],
    ),
    pvp: guide(
      "Strength gives immediate physical damage and Undying Oath adds survival plus a comeback window in a short, volatile mode. Pitcher cannot rely on Bloodlust stacks here, so the pair values dependable output and staying power.",
      "Best when you must use Pitcher in PvP and early enemy pressure makes survival meaningful.",
      [
        fallback("strength", "focus", "Higher immediate damage when Pitcher is safe and the target qualifies as single target."),
        fallback("strength", "wave", "A stable damage alternative against grouped targets without revive variance."),
      ],
    ),
    guild: guide(
      "Strength scales the physical kit and Hunter adds direct boss damage. Both are always-on multipliers, making this the safest Pitcher setup when Batter is unavailable.",
      "Best only when the Batter form cannot be used; Batter remains the preferred dedicated boss form.",
      [
        fallback("hunter", "focus", "Use when the target qualifies for Focus and your Focus rune is materially stronger than Strength."),
        fallback("hunter", "wave", "A broader fallback if adds or area damage remain relevant during the encounter."),
      ],
    ),
  },
  "ace-bat-man-batter": {
    pve: guide(
      "Bloodlust benefits from PvE kill volume and Battle directly improves Batter's defining ultimate damage. The pairing combines long-run scaling with the burst event that gives this form its identity.",
      "Best when Batter is active early enough to stack Bloodlust and the ultimate receives full value in the key waves.",
      [
        fallback("strength", "battle", "The immediate, no-stacking replacement when Batter arrives late."),
        fallback("wave", "battle", "Use when grouped-wave burst matters more than broad physical scaling."),
      ],
    ),
    pvp: guide(
      "Focus improves the dominant single-target batting sequence and Battle multiplies the ultimate. Both work immediately, which fits PvP better than a kill-stacking setup.",
      "Best when the decisive PvP target qualifies for Focus and Batter can deliver the complete ultimate sequence.",
      [
        fallback("strength", "battle", "The safe fallback when Focus's target condition is not consistently met."),
        fallback("focus", "strength", "More even damage across the fight when ultimate damage is not the only win condition."),
      ],
    ),
    guild: guide(
      "Focus strengthens the single-target batting pattern and Battle boosts the boss-focused ultimate burst. This concentrates both slots on Batter's strongest Guild damage window.",
      "Best when Focus is valid on the Guild target and the ultimate lands without interruption.",
      [
        fallback("hunter", "battle", "The encounter-safe fallback when Focus eligibility is uncertain."),
        fallback("strength", "battle", "Reliable physical scaling if Hunter is unavailable or under-tiered."),
      ],
    ),
  },
  "great-kitty-mage": allModes(guide(
    "Mastery and Imperfect Spell maximize activation frequency for Great Kitty Mage's support effects. Because Kitty is chosen to accelerate allies rather than deal damage, Imperfect Spell's damage penalty is usually irrelevant to the team result.",
    "Best when Kitty can remain safe and your team benefits directly from the highest possible support activation uptime.",
    [
      fallback("mastery", "mana", "The stable resource fallback when Imperfect Spell is unavailable or MP is the real limiter."),
      fallback("mastery", "scatter-shot", "Use when expanding the effective support area solves inconsistent ally coverage."),
    ],
    "Great Kitty Mage has no Limit Break, so there is no LB breakpoint that changes this recommendation.",
  )),
  "colony-tar": {
    pve: guide(
      "Wave improves Tar's repeated area damage and Strength covers the complete physical kit. Tar often transforms too late for Bloodlust to build enough stacks, making two immediate multipliers the dependable PvE answer.",
      "Best for normal late transformation timing and dense waves where Sweep and other area hits connect consistently.",
      [
        fallback("amplification", "strength", "A strong skill-focused option when area coverage is already sufficient."),
        fallback("bloodlust", "wave", "Only for unusually early Tar access with enough remaining kills to stack Bloodlust."),
      ],
    ),
    pvp: guide(
      "Strength scales Tar's full physical kit and Amplification improves the repeated Sweep and Contaminant skill loop. Both provide immediate value in short rounds and cover different parts of the same damage cycle.",
      "Best for standard PvP where Tar repeatedly lands skills but cannot depend on long-run kill scaling.",
      [
        fallback("strength", "wave", "The broad area-damage fallback when multiple targets stay grouped."),
        fallback("amplification", "battle", "An ultimate-leaning setup when Abyss is the decisive event."),
      ],
    ),
    guild: guide(
      "Hunter adds reliable boss damage and Amplification scales Tar's repeated skill damage. The pair remains active across the encounter and does not overinvest in only the Abyss ultimate.",
      "Best for sustained boss contact where Sweep and Contaminant contribute alongside Abyss.",
      [
        fallback("hunter", "battle", "The 5/6 ultimate-focused fallback when Abyss dominates your measured damage."),
        fallback("hunter", "strength", "Broader physical boss scaling when regular attacks and non-skill damage matter more."),
      ],
    ),
  },
  "sage-kun": {
    pve: guide(
      "Magic covers Sage Kun's complete Magic DMG kit and Mastery increases both Flame Shot and Flame Acceleration activation. The pair improves every major source while also accelerating the internal proc loop.",
      "Best as the reliable PvE default when Sage Kun is not specifically built around one isolated skill.",
      [
        fallback("magic", "amplification", "More damage per skill activation when external buffs already provide enough proc frequency."),
        fallback("mastery", "mana", "A smoother activation-and-resource setup when MP is limiting total casts."),
      ],
    ),
    pvp: guide(
      "Magic supplies immediate full-kit damage and Mastery raises Flame Shot and Flame Acceleration frequency. That combination is reliable in short PvP rounds and avoids any stack requirement.",
      "Best when Sage Kun needs immediate pressure and both proc skills contribute to the round.",
      [
        fallback("magic", "amplification", "Use for stronger individual skill hits if activation rate is already high."),
        fallback("mastery", "barrier", "A survival-oriented support fallback when early disruption prevents the proc loop."),
      ],
    ),
    guild: guide(
      "Hunter gives the boss multiplier and Magic covers the complete Magic DMG kit. It is the broadest stable Guild pair and does not assume that one proc skill dominates the full damage profile.",
      "Best for steady boss uptime where Sage Kun's entire kit continues to connect.",
      [
        fallback("hunter", "mastery", "Better when proc frequency is the measured bottleneck rather than damage per hit."),
        fallback("hunter", "amplification", "A skill-focused boss alternative when skill hits dominate the parse."),
      ],
    ),
  },
  "genie-wiz-zap": {
    pve: guide(
      "Magic covers Genie's complete kit and Focus strengthens the continuously charged single-target laser that produces most of his damage. Genie also tends to arrive too late for scaling runes, making immediate multipliers more valuable.",
      "Best when the laser remains locked on an isolated eligible target and Genie is summoned in the later part of the run.",
      [
        fallback("magic", "amplification", "The reliable choice when Focus eligibility or target isolation cannot be maintained."),
        fallback("magic", "focused-aim", "A positional alternative when board placement is stable and satisfies Focused Aim."),
      ],
    ),
    pvp: guide(
      "Magic improves the full kit while Focus amplifies the dominant continuous laser. Both apply immediately and concentrate damage on the priority target without needing kills or ramp time.",
      "Best when PvP target selection keeps the laser on one Focus-eligible enemy for most of its charge.",
      [
        fallback("magic", "amplification", "Safer when targets change often or the laser loses single-target eligibility."),
        fallback("magic", "focused-aim", "Good when fixed board positioning is easier to guarantee than Focus's target condition."),
      ],
    ),
    guild: guide(
      "Hunter multiplies boss damage and Focus strengthens Genie's dominant single-target laser. The two encounter-specific bonuses stack on the part of the kit that matters most during the boss window.",
      "Best when the Guild target qualifies for Focus and Genie maintains uninterrupted laser contact.",
      [
        fallback("hunter", "magic", "The broad 5.5/6 fallback when Focus eligibility is uncertain or other Magic skills matter more."),
        fallback("hunter", "amplification", "A skill-oriented boss setup when the laser classification does not receive full Focus value."),
      ],
      "Focus is condition-dependent; use Hunter + Magic if the target or laser does not consistently qualify.",
    ),
  },
  "azure-dragon-taoist": {
    pve: guide(
      "Magic applies to Azure's complete damage kit and Amplification improves Billowing Wind, Cutting Gust and Dragon Twister. That gives broad coverage plus extra weight to the repeated skills that clear waves.",
      "Best for normal PvE where Azure's area skills repeatedly connect with grouped targets.",
      [
        fallback("magic", "mastery", "Use when additional proc activations outperform the extra damage per skill."),
        fallback("magic", "wave", "A wave-clear alternative when area coverage is the dominant requirement."),
      ],
    ),
    pvp: guide(
      "Magic covers the complete kit while Mastery increases activation rates for both damage procs. Immediate full-kit scaling plus more proc opportunities is the most reliable short-mode combination.",
      "Best when Azure needs consistent PvP pressure from both proc skills rather than one large isolated hit.",
      [
        fallback("magic", "amplification", "Close damage fallback when proc frequency is already high."),
        fallback("mastery", "amplification", "More skill-centric but gives up Magic's coverage of the full kit."),
      ],
    ),
    guild: guide(
      "Hunter supplies boss damage and Magic scales Azure's complete Magic DMG kit. The result is reliable across every damaging action and does not rely on a proc-only or area-only condition.",
      "Best for sustained Guild boss contact where Azure's full rotation continues to land.",
      [
        fallback("hunter", "mastery", "Better if increasing proc count produces more value than the broad Magic multiplier."),
        fallback("hunter", "amplification", "Use when Billowing Wind, Cutting Gust and Dragon Twister dominate the boss parse."),
      ],
    ),
  },
  "evergreen-verdee": allModes(guide(
    "Speed creates more attacks, which feeds the attack-count loop that produces Mini and King Treeees. Amplification then improves the repeated Treeee and Bloom skill damage generated by that loop, so one rune creates more events and the other strengthens them.",
    "Best when Verdee attacks continuously and spawned Treeees survive long enough to deliver their damage.",
    [
      fallback("speed", "battle", "The ultimate-heavy alternative when King Treeee is the clear majority of valuable damage."),
      fallback("mastery", "amplification", "Use when external attack speed is already very high and proc activation becomes the better lever."),
    ],
  )),
  "noisy-penguin-musician": {
    pve: guide(
      "Mastery increases support activation frequency and Scatter Shot enlarges the area of Penguin's ally attack-speed buff. The pair improves both how often the buff appears and how reliably it reaches the intended formation.",
      "Best when several damage dealers need to remain inside Penguin's buff area during PvE waves.",
      [
        fallback("mastery", "imperfect-spell", "More activation frequency when the formation already fits comfortably inside the normal area."),
        fallback("mastery", "mana", "The resource-consistency option when MP limits support uptime."),
      ],
    ),
    pvp: guide(
      "Mastery maintains support activations while Barrier protects Penguin from early harmful effects that can stop the buff cycle. PvP disruption makes survival more valuable than the larger Scatter Shot area.",
      "Best when enemy opening pressure or control regularly prevents Penguin from supporting the team.",
      [
        fallback("mastery", "imperfect-spell", "Higher activation ceiling when Penguin is already safe."),
        fallback("mastery", "scatter-shot", "Use when formation coverage, not survival, is the actual PvP problem."),
      ],
    ),
    guild: guide(
      "Mastery raises buff activation frequency and Scatter Shot expands the ally attack-speed buff area. Guild formations often spread multiple damage units around supports, so coverage can preserve more total team uptime than another personal rune.",
      "Best when the enlarged area reaches additional high-value damage dealers throughout the boss attempt.",
      [
        fallback("mastery", "imperfect-spell", "Better if every important ally already fits inside the base buff area."),
        fallback("mastery", "mana", "Use when MP consistency, rather than proc rate or area, limits uptime."),
      ],
    ),
  },
  "awakened-hailey": {
    pve: guide(
      "Mastery increases Hailey's important activations and Magic scales the complete normal damage kit. The pair remains reliable across ordinary Hailey levels and becomes even safer once levels 23-25 strengthen Flare.",
      "Best for normal leveled Hailey builds where every skill, including Flare, should remain enabled and valuable.",
      [
        fallback("amplification", "magic", "More damage per skill when activation frequency is already sufficiently buffed."),
        fallback("mastery", "wave", "A wave-clear option when area damage matters more than broad full-kit scaling."),
      ],
      "Onslaught is only a below-level-23 experiment with exceptional Mana, attack speed and Kitty support; it is not a standard fallback.",
    ),
    pvp: guide(
      "Mastery improves activation frequency and Magic gives immediate full-kit damage without relying on stacks. This consistent coverage is safer than disabling part of Hailey's kit for a narrow theory setup.",
      "Best for standard PvP and especially for level 23+ Hailey, where Flare receives meaningful upgrades.",
      [
        fallback("amplification", "magic", "Use when stronger individual skill hits matter more than additional activations."),
        fallback("mastery", "barrier", "A defensive fallback when early control prevents Hailey from completing her rotation."),
      ],
      "Do not use Onslaught at levels 23-25; those upgrades make Flare substantially more valuable.",
    ),
    guild: guide(
      "Mastery increases the number of important activations and Hunter applies dependable boss damage. It covers the boss encounter without disabling any skill or depending on an unproven rotation change.",
      "Best for stable Guild damage at normal Hailey levels, especially level 23 and above.",
      [
        fallback("hunter", "magic", "Broad boss and full-kit Magic damage when activation rate is already high."),
        fallback("hunter", "amplification", "A skill-damage boss alternative if skill hits dominate the measured result."),
      ],
      "Onslaught remains a niche below-level-23 test and requires unusually strong Mana, attack-speed and Kitty support.",
    ),
  },
  "chrono-ato": allModes(guide(
    "Mastery and Imperfect Spell maximize activation of Chrono Ato's physical-team buff. Ato's value is the team multiplier created by that buff, so reducing personal damage is acceptable when it produces more consistent ally uptime.",
    "Best when Chrono Ato is used as a dedicated support for multiple physical damage dealers and can remain safely active.",
    [
      fallback("mastery", "scatter-shot", "Use when the buff activates often enough but fails to cover the whole formation."),
      fallback("mastery", "time-reversal", "A higher-variance alternative when repeating the key support event has strong team value."),
    ],
  )),
  "captain-roka": {
    pve: guide(
      "Amplification and Slayer both strengthen Roka's important skill damage from the moment he transforms. Bloodlust usually starts stacking too late, so the fixed pair reaches useful power sooner and stays dependable through the final waves.",
      "Best for normal transformation timing where only a limited number of waves remain.",
      [
        fallback("strength", "slayer", "Reliable broad physical scaling when Amplification is unavailable."),
        fallback("battle", "slayer", "An ultimate-leaning 5/6 alternative when Roka's largest burst decides the wave."),
      ],
    ),
    pvp: guide(
      "Focus is the leading single-target damage theory and Slayer scales Roka's major skill. The pair is immediate and avoids Bloodlust ramp, but Focus depends on target eligibility and Roka's exact skill classifications still need controlled confirmation.",
      "Best when the decisive PvP target is isolated and consistently qualifies for Focus.",
      [
        fallback("amplification", "slayer", "The safest 5/6 fallback until every Roka skill classification is proven."),
        fallback("strength", "slayer", "Broad physical damage when neither Focus nor Amplification conditions are dependable."),
      ],
      "This is the only medium-confidence fixed BiS pair; treat Amplification + Slayer as the conservative competitive choice.",
    ),
    guild: guide(
      "Hunter applies reliable boss damage and Slayer improves Roka's key skill output. Both runes work immediately after transformation and avoid any dependence on late kill stacks.",
      "Best for standard Guild boss uptime once Roka reaches the transformed form.",
      [
        fallback("hunter", "amplification", "More general boss skill damage when Slayer is under-tiered or classification coverage is uncertain."),
        fallback("hunter", "strength", "The broad physical boss fallback for a mixed regular-and-skill damage profile."),
      ],
    ),
  },
  "boss-birdraw": {
    pve: guide(
      "Mastery drives the Hard Shuffle, Prime Circle, Trick Token and Finale feedback loop, while Magic improves every Magic DMG source. More loop activations and full-kit scaling reinforce each other throughout long waves.",
      "Best when Birdraw remains active long enough for the complete Trick Token and Finale loop to cycle repeatedly.",
      [
        fallback("amplification", "magic", "Stronger individual skill hits when external buffs already supply enough activation rate."),
        fallback("mastery", "wave", "A wave-clear alternative when area pressure matters more than full-kit Magic coverage."),
      ],
    ),
    pvp: guide(
      "Mastery sustains the internal proc loop and Magic gives immediate full-kit damage. The pair needs no early stacks and remains useful even when a short round permits only a few complete cycles.",
      "Best for standard PvP where reliable activation and broad damage are safer than a specialized single-skill build.",
      [
        fallback("amplification", "magic", "Use when burst per activation matters more than generating extra loop events."),
        fallback("mastery", "barrier", "A defensive option if disruption repeatedly prevents Birdraw from completing the loop."),
      ],
    ),
    guild: guide(
      "Mastery keeps the Trick Token and Finale loop moving, while Hunter multiplies its output against the boss. One slot preserves the engine and the other applies the encounter-wide damage bonus.",
      "Best for sustained boss uptime where Birdraw completes multiple feedback-loop cycles.",
      [
        fallback("hunter", "magic", "Broad boss and Magic damage when activation rate is already saturated."),
        fallback("hunter", "amplification", "A boss skill-damage option when individual skill hits dominate the parse."),
      ],
    ),
  },
  "giga-chad": allModes(guide(
    "Mastery and Imperfect Spell generate more Enhanced Signal activation checks. Infection Shell's stored-damage result is no longer affected by normal rune damage buffs, so increasing the support proc is more valuable than trying to scale Chad's own damage; that activation gain also outweighs Imperfect Spell's personal damage penalty.",
    "Best when Giga Chad supports several Mythic-or-higher units that consistently benefit from repeated Enhanced Signal activations.",
    [
      fallback("speed", "mastery", "The less-effective fallback when Imperfect Spell is unavailable and faster basic attacks create additional Enhanced Signal checks."),
      fallback("flurry", "mastery", "An unconfirmed extra-hit alternative when Flurry creates more Enhanced Signal checks; use only after comparing team output against Speed."),
    ],
  )),
  "savior-ray": {
    pve: guide(
      "Strength covers Ray's complete physical kit and Wave improves Piercing Blades, Sword Aura and Rain of Blades. Ray does not collect enough reliable kills for Bloodlust, so two immediate multipliers are the stronger late-run plan.",
      "Best for normal PvE placement against grouped waves when Ray cannot build a large personal kill stack.",
      [
        fallback("strength", "amplification", "A skill-focused alternative when area coverage is already sufficient."),
        fallback("strength", "battle", "Use when the ultimate contributes most of the damage needed for the final waves."),
      ],
    ),
    pvp: guide(
      "Strength scales the entire physical kit and Wave covers Ray's repeated area attacks. The pair is immediate and remains reliable as targets move or group during a short PvP round.",
      "Best for normal PvP boards where Ray regularly hits multiple enemies with his area skills.",
      [
        fallback("strength", "focused-aim", "The 5/6 positional alternative when Ray can safely hold the required tile."),
        fallback("strength", "amplification", "A stronger skill-hit setup when targets are too spread out for Wave."),
      ],
    ),
    guild: guide(
      "Hunter multiplies damage into the boss and Strength applies across Ray's complete physical kit. The pair is broad, always active and does not depend on area grouping or a positional condition.",
      "Best for stable single-boss contact where every part of Ray's physical rotation contributes.",
      [
        fallback("hunter", "focused-aim", "A positional 5/6 option if Focused Aim can be maintained for the entire attempt."),
        fallback("hunter", "amplification", "The skill-focused fallback when Ray's named skills dominate the boss parse."),
      ],
    ),
  },
  "knight-lancelot": {
    pve: guide(
      "Mastery produces more Sword of Judgment casts and Max-HP triggers, while Magic scales Lancelot's complete normal damage kit. At LB23+ Mastery also creates more Flame Pillars, and at LB24+ it improves uptime of the nearby-allies Magic-DMG aura, so Limit Break strengthens the same pair instead of replacing it.",
      "Best at every Lancelot level, with especially strong team value at LB23-25 when the Flame Pillar and aura upgrades are unlocked.",
      [
        fallback("amplification", "magic", "A close damage fallback when activation rate is already saturated by the team."),
        fallback("mastery", "mana", "Use when MP consistency prevents Sword of Judgment from cycling on schedule."),
      ],
      "LB19 reduces the Lancelot requirement but does not change the best rune mechanics; LB22's Ember upgrade also leaves the pair intact.",
    ),
    pvp: guide(
      "Mastery increases Sword of Judgment and Max-HP trigger frequency, while Magic gives immediate full-kit damage. LB23-25 adds more Flame Pillars and better aura uptime, reinforcing Mastery rather than creating a separate PvP breakpoint.",
      "Best for reliable short-round pressure at all levels, especially once LB23 unlocks the additional Flame Pillar value.",
      [
        fallback("amplification", "magic", "More damage per skill activation when proc frequency is already sufficiently high."),
        fallback("mastery", "barrier", "A defensive fallback if early control stops Lancelot before he can establish the Judgment loop."),
      ],
    ),
    guild: guide(
      "Mastery creates additional Max-HP triggers and, at LB23+, more Flame Pillars; LB24+ also turns that frequency into better uptime for the 15% nearby-allies Magic-DMG aura. Hunter then applies safe boss damage, giving the pair both personal and team value.",
      "Best for the standard Guild setup, particularly at LB24-25 when nearby Magic allies can exploit the improved aura uptime.",
      [
        fallback("hunter", "magic", "A broad 5.5/6 boss-damage fallback when Mastery is unavailable or activation rate is already capped."),
        fallback("mastery", "time-reversal", "An unproven 5.5/6 high-variance alternative that needs testing against the safe Hunter result."),
      ],
      "Time Reversal has interesting ceiling but is not yet proven strongly enough to replace Hunter in the fixed recommendation.",
    ),
  },
};
