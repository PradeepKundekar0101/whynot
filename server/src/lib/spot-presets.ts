/**
 * Predefined spot pools (named lists of teams, characters, etc.) and break
 * templates (full Quick-Start configurations). Used by both the API
 * (validation + create) and the client (dropdown options + template picker).
 */

export const SPOT_PRESETS = {
  // ── Sports teams ────────────────────────────────────────────────────────
  nfl_teams: [
    "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
    "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
    "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
    "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
    "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
    "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
    "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
    "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
  ],
  nfl_divisions: [
    "AFC East", "AFC North", "AFC South", "AFC West",
    "NFC East", "NFC North", "NFC South", "NFC West",
  ],
  nba_teams: [
    "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
    "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
    "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
    "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
    "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
    "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
    "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
    "Utah Jazz", "Washington Wizards",
  ],
  nba_divisions: [
    "Atlantic", "Central", "Southeast",
    "Northwest", "Pacific", "Southwest",
  ],
  mlb_teams: [
    "Arizona Diamondbacks", "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "Chicago Cubs", "Chicago White Sox", "Cincinnati Reds", "Cleveland Guardians",
    "Colorado Rockies", "Detroit Tigers", "Houston Astros", "Kansas City Royals",
    "Los Angeles Angels", "Los Angeles Dodgers", "Miami Marlins", "Milwaukee Brewers",
    "Minnesota Twins", "New York Mets", "New York Yankees", "Athletics",
    "Philadelphia Phillies", "Pittsburgh Pirates", "San Diego Padres", "San Francisco Giants",
    "Seattle Mariners", "St. Louis Cardinals", "Tampa Bay Rays", "Texas Rangers",
    "Toronto Blue Jays", "Washington Nationals",
  ],
  nhl_teams: [
    "Anaheim Ducks", "Boston Bruins", "Buffalo Sabres", "Calgary Flames",
    "Carolina Hurricanes", "Chicago Blackhawks", "Colorado Avalanche", "Columbus Blue Jackets",
    "Dallas Stars", "Detroit Red Wings", "Edmonton Oilers", "Florida Panthers",
    "Los Angeles Kings", "Minnesota Wild", "Montreal Canadiens", "Nashville Predators",
    "New Jersey Devils", "New York Islanders", "New York Rangers", "Ottawa Senators",
    "Philadelphia Flyers", "Pittsburgh Penguins", "San Jose Sharks", "Seattle Kraken",
    "St. Louis Blues", "Tampa Bay Lightning", "Toronto Maple Leafs", "Utah Hockey Club",
    "Vancouver Canucks", "Vegas Golden Knights", "Washington Capitals", "Winnipeg Jets",
  ],

  // ── Pokemon characters (popular subset for character breaks) ────────────
  pokemon_popular: [
    "Pikachu", "Charizard", "Mewtwo", "Mew", "Lugia", "Rayquaza",
    "Gyarados", "Snorlax", "Gengar", "Eevee", "Lucario", "Greninja",
    "Garchomp", "Tyranitar", "Dragonite", "Metagross", "Salamence",
    "Sceptile", "Blaziken", "Swampert", "Decidueye", "Incineroar",
    "Primarina", "Rillaboom", "Cinderace", "Inteleon", "Ogerpon",
    "Terapagos", "Koraidon", "Miraidon",
  ],

  custom: [],
} as const;

export type SpotPresetKey = keyof typeof SPOT_PRESETS;

export const SHIPPING_PROFILES = [
  { value: "0-1oz", label: "0–1 oz", description: "Singles, small cards" },
  { value: "1-3oz", label: "1–3 oz", description: "Few cards" },
  { value: "4-7oz", label: "4–7 oz", description: "Recommended for most breaks" },
  { value: "8-15oz", label: "8–15 oz", description: "Multiple slabs" },
  { value: "1-2lb", label: "1–2 lb", description: "Sealed packs" },
  { value: "2-5lb", label: "2–5 lb", description: "Sealed boxes" },
  { value: "5-10lb", label: "5–10 lb", description: "Cases / hobby boxes" },
] as const;

export type ShippingProfileKey = (typeof SHIPPING_PROFILES)[number]["value"];

export function isValidPreset(key: string): key is SpotPresetKey {
  return key in SPOT_PRESETS;
}

export function isValidShippingProfile(key: string): boolean {
  return SHIPPING_PROFILES.some((p) => p.value === key);
}

// ── Break format types ─────────────────────────────────────────────────────

export const SPOT_TYPES = ["team", "character", "pack", "hit", "slot"] as const;
export type SpotType = (typeof SPOT_TYPES)[number];

export const ASSIGNMENT_MODES = [
  "pick_your",
  "pre_assigned",
  "random_per_spot",
  "random_at_end",
] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export function isSpotType(value: string): value is SpotType {
  return (SPOT_TYPES as readonly string[]).includes(value);
}

export function isAssignmentMode(value: string): value is AssignmentMode {
  return (ASSIGNMENT_MODES as readonly string[]).includes(value);
}

// ── Quick-start templates ──────────────────────────────────────────────────

export interface BreakTemplate {
  id: string;
  name: string;
  description: string;
  config: {
    spotType: SpotType;
    assignmentMode: AssignmentMode;
    autoRandomize: boolean;
    quickSpin: boolean;
    spotPreset: SpotPresetKey;
    /** Default starting count for the "Number of Spots" field. */
    defaultSpotCount: number;
    consolationPrize?: string;
  };
}

/**
 * Curated quick-start templates so sellers don't have to set every knob from
 * scratch. The client renders these in the BreakCreationModal as a top-level
 * picker; selecting one pre-fills the rest of the form (still editable).
 */
export const BREAK_TEMPLATES: BreakTemplate[] = [
  {
    id: "pick_your_nfl",
    name: "Pick Your NFL Team",
    description: "Buyers bid on specific NFL teams.",
    config: {
      spotType: "team",
      assignmentMode: "pick_your",
      autoRandomize: false,
      quickSpin: false,
      spotPreset: "nfl_teams",
      defaultSpotCount: 32,
    },
  },
  {
    id: "random_nfl",
    name: "Random NFL Team",
    description: "Buyers bid on numbered spots; teams revealed via spin.",
    config: {
      spotType: "team",
      assignmentMode: "pre_assigned",
      autoRandomize: true,
      quickSpin: true,
      spotPreset: "nfl_teams",
      defaultSpotCount: 32,
    },
  },
  {
    id: "pokemon_character",
    name: "Pokemon Character Break",
    description: "Pikachu, Charizard, etc., plus a guaranteed booster pack.",
    config: {
      spotType: "character",
      assignmentMode: "pre_assigned",
      autoRandomize: true,
      quickSpin: true,
      spotPreset: "pokemon_popular",
      defaultSpotCount: 12,
      consolationPrize: "Korean Booster Pack",
    },
  },
  {
    id: "pack_break",
    name: "Per-Pack Break",
    description: "Each spot is one pack from the box.",
    config: {
      spotType: "pack",
      assignmentMode: "pre_assigned",
      autoRandomize: true,
      quickSpin: true,
      spotPreset: "custom",
      defaultSpotCount: 8,
    },
  },
  {
    id: "custom",
    name: "Custom Break",
    description: "Build your own from scratch.",
    config: {
      spotType: "slot",
      assignmentMode: "pick_your",
      autoRandomize: true,
      quickSpin: true,
      spotPreset: "custom",
      defaultSpotCount: 10,
    },
  },
];

export function findTemplate(id: string): BreakTemplate | undefined {
  return BREAK_TEMPLATES.find((t) => t.id === id);
}

/**
 * Buyer-facing copy keyed by spotType. Used by the client modal title,
 * "See {Spots|Teams|Characters}" buttons, and chat events.
 */
export const SPOT_TYPE_LABELS: Record<SpotType, { singular: string; plural: string; pickVerb: string }> = {
  team: { singular: "team", plural: "teams", pickVerb: "Pick a Team" },
  character: { singular: "character", plural: "characters", pickVerb: "Pick a Character" },
  pack: { singular: "pack", plural: "packs", pickVerb: "Pick a Pack" },
  hit: { singular: "hit", plural: "hits", pickVerb: "Pick a Hit" },
  slot: { singular: "spot", plural: "spots", pickVerb: "Pick a Spot" },
};
