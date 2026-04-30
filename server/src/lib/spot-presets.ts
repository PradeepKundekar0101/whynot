/**
 * Predefined spot presets for breaks. The seller picks one from a dropdown
 * and the spot table is auto-populated. Used by both the API (validation)
 * and the client (dropdown options).
 */

export const SPOT_PRESETS = {
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
