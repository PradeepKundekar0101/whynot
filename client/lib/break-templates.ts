import type { AssignmentMode, SpotType } from "./break-types";

/**
 * Quick-start templates for the BreakCreationModal. These mirror the catalog
 * the server returns from /api/breaks/presets.templates — keeping a local
 * copy means the form renders instantly without a network round-trip and
 * still works if /presets ever fails. Server is authoritative for validation.
 */
export interface BreakTemplate {
  id: string;
  name: string;
  description: string;
  config: {
    spotType: SpotType;
    assignmentMode: AssignmentMode;
    autoRandomize: boolean;
    quickSpin: boolean;
    spotPreset: string;
    /** Default count for the "Number of Spots" field. */
    defaultSpotCount: number;
    consolationPrize?: string;
  };
}

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

// ── Form-level helper labels ──────────────────────────────────────────────

export const SPOT_TYPE_OPTIONS: Array<{ value: SpotType; label: string; hint: string }> = [
  { value: "team", label: "Team", hint: "Sports teams (NFL, NBA, MLB, NHL…)" },
  { value: "character", label: "Character", hint: "Pokemon, anime, video-game characters" },
  { value: "pack", label: "Pack", hint: "Individual booster packs from a box" },
  { value: "hit", label: "Hit", hint: "Major hits from a comic / TCG box" },
  { value: "slot", label: "Slot", hint: "Generic numbered slot — anything goes" },
];

export const ASSIGNMENT_MODE_OPTIONS: Array<{
  value: AssignmentMode;
  label: string;
  hint: string;
}> = [
  {
    value: "pick_your",
    label: "Pick Your",
    hint: "Buyers pick the specific item at purchase. No reveal needed.",
  },
  {
    value: "pre_assigned",
    label: "Pre-Assigned (Random)",
    hint: "Pool shuffled at break creation. Each spot's content hidden until that spot is sold.",
  },
  {
    value: "random_per_spot",
    label: "Random Per Spot",
    hint: "Server picks a random unused item at the moment each spot is revealed.",
  },
  {
    value: "random_at_end",
    label: "Random At End",
    hint: "Buyers bid on numbered spots; everyone learns their item in one batch reveal at the end.",
  },
];
