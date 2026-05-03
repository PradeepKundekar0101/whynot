"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ASSIGNMENT_MODE_OPTIONS,
  BREAK_TEMPLATES,
  SPOT_TYPE_OPTIONS,
  findTemplate,
  type BreakTemplate,
} from "@/lib/break-templates";
import { spotTypeCopy, type AssignmentMode, type SpotType } from "@/lib/break-types";
import { ManageSpotsModal, type SpotRow } from "./ManageSpotsModal";

interface PresetsResponse {
  presets: Record<string, string[]>;
  shippingProfiles: Array<{ value: string; label: string; description: string }>;
}

interface BreakCreationModalProps {
  open: boolean;
  onClose: () => void;
  streamId: string;
  onCreated: () => void;
}

const PRESET_OPTIONS = [
  { value: "nfl_teams", label: "NFL teams" },
  { value: "nfl_divisions", label: "NFL divisions" },
  { value: "nba_teams", label: "NBA teams" },
  { value: "nba_divisions", label: "NBA divisions" },
  { value: "mlb_teams", label: "MLB teams" },
  { value: "nhl_teams", label: "NHL teams" },
  { value: "pokemon_popular", label: "Pokemon characters" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_STARTING_PRICE = 100; // $1 in cents
const DEFAULT_TEMPLATE_ID = "random_nfl";

function poolToSpots(pool: string[], assignmentMode: AssignmentMode): SpotRow[] {
  // Pick-your: spotName IS the team name (one per pool entry).
  // Other modes: spotName is "Spot #N" (anonymous label).
  if (assignmentMode === "pick_your") {
    return pool.map((name, i) => ({
      id: `s-${i}`,
      spotName: name,
      startingPrice: DEFAULT_STARTING_PRICE,
      description: "",
    }));
  }
  return pool.map((_, i) => ({
    id: `s-${i}`,
    spotName: `Spot #${i + 1}`,
    startingPrice: DEFAULT_STARTING_PRICE,
    description: "",
  }));
}

/**
 * Generate a fresh per-pack pool of "Pack 1, Pack 2 …". Used when the seller
 * picks the pack-break template (or the Pack spotType with no preset).
 */
function packPool(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Pack ${i + 1}`);
}

export function BreakCreationModal({
  open,
  onClose,
  streamId,
  onCreated,
}: BreakCreationModalProps) {
  const [sellingMode, setSellingMode] = useState<"buy_it_now" | "auction">("auction");
  const [breakName, setBreakName] = useState("");
  const [breakDescription, setBreakDescription] = useState("");
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [spotType, setSpotType] = useState<SpotType>("team");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("pre_assigned");
  const [spotPreset, setSpotPreset] = useState<string>("nfl_teams");
  const [numberOfSpots, setNumberOfSpots] = useState<number>(32);
  const [shippingProfile, setShippingProfile] = useState("4-7oz");
  const [autoRandomize, setAutoRandomize] = useState(true);
  const [quickSpin, setQuickSpin] = useState(true);
  const [consolationPrize, setConsolationPrize] = useState("");
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  // Per-preset edited spots (so flipping presets doesn't lose unsaved edits).
  const [poolByPreset, setPoolByPreset] = useState<Record<string, string[]>>({});
  const [customPool, setCustomPool] = useState<string[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch presets the first time the modal is opened.
  useEffect(() => {
    if (!open || presets) return;
    void apiFetch("/breaks/presets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PresetsResponse | null) => {
        if (!data) return;
        setPresets(data);
        const seeded: Record<string, string[]> = {};
        for (const [k, names] of Object.entries(data.presets)) {
          if (k === "custom") continue;
          seeded[k] = [...names];
        }
        setPoolByPreset(seeded);
      });
  }, [open, presets]);

  // Apply a template to every config field. Called when the seller picks
  // a Quick Start tile.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "custom") return; // leave fields untouched
    const t = findTemplate(id);
    if (!t) return;
    setSpotType(t.config.spotType);
    setAssignmentMode(t.config.assignmentMode);
    setSpotPreset(t.config.spotPreset);
    setNumberOfSpots(t.config.defaultSpotCount);
    setAutoRandomize(t.config.autoRandomize);
    setQuickSpin(t.config.quickSpin);
    setConsolationPrize(t.config.consolationPrize ?? "");
  };

  // ── Resolve the actual pool we'll send to the server ──────────────────
  // Pick-your needs exactly numberOfSpots items; other modes need >= count.
  const resolvedPool: string[] = useMemo(() => {
    // Pack break with no preset: synthesize "Pack 1..N".
    if (spotType === "pack" && spotPreset === "custom") {
      return packPool(numberOfSpots);
    }
    if (spotPreset === "custom") {
      return customPool.slice(0, assignmentMode === "pick_your" ? numberOfSpots : customPool.length);
    }
    const fullPool = poolByPreset[spotPreset] ?? [];
    if (assignmentMode === "pick_your") {
      // Must equal spot count; if user requested more than the preset has,
      // cap to the preset size.
      return fullPool.slice(0, Math.min(numberOfSpots, fullPool.length));
    }
    // Random / pre_assigned modes use the full preset (server picks N).
    return fullPool;
  }, [spotType, spotPreset, customPool, poolByPreset, numberOfSpots, assignmentMode]);

  // Spots = the rows we'll create. For pick_your, one per pool entry; for
  // random modes, "Spot #N" placeholders the server hides behind the pool.
  const currentSpots: SpotRow[] = useMemo(() => {
    if (assignmentMode === "pick_your") {
      return poolToSpots(resolvedPool, "pick_your");
    }
    // Cap by pool size so server validation never fires POOL_TOO_SMALL.
    const cap = Math.min(numberOfSpots, resolvedPool.length || numberOfSpots);
    return Array.from({ length: cap }, (_, i) => ({
      id: `r-${i}`,
      spotName: `Spot #${i + 1}`,
      startingPrice: DEFAULT_STARTING_PRICE,
      description: "",
    }));
  }, [assignmentMode, resolvedPool, numberOfSpots]);

  const setPoolForCurrent = (rows: SpotRow[]) => {
    if (assignmentMode === "pick_your") {
      // Pool = the spotName list when picking your own.
      const names = rows.map((r) => r.spotName);
      if (spotPreset === "custom") setCustomPool(names);
      else setPoolByPreset((prev) => ({ ...prev, [spotPreset]: names }));
      setNumberOfSpots(names.length);
    } else {
      // Random modes: rows are "Spot #N" — the seller is editing the pool
      // separately via ManageSpotsModal. Replace customPool with the names
      // they typed (they'll show up as candidate teams/characters/packs).
      const names = rows.map((r) => r.spotName);
      setCustomPool(names);
    }
  };

  const reset = () => {
    setSellingMode("auction");
    setBreakName("");
    setBreakDescription("");
    setTemplateId(DEFAULT_TEMPLATE_ID);
    setSpotType("team");
    setAssignmentMode("pre_assigned");
    setSpotPreset("nfl_teams");
    setNumberOfSpots(32);
    setShippingProfile("4-7oz");
    setAutoRandomize(true);
    setQuickSpin(true);
    setConsolationPrize("");
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!breakName.trim()) {
      setError("Give the break a name.");
      return;
    }
    if (currentSpots.length === 0) {
      setError("Add at least one spot.");
      return;
    }
    if (resolvedPool.length === 0) {
      setError("Add at least one item to the pool.");
      return;
    }
    if (assignmentMode === "pick_your" && resolvedPool.length !== currentSpots.length) {
      setError("Pick-your needs exactly one pool entry per spot.");
      return;
    }
    if (assignmentMode !== "pick_your" && resolvedPool.length < currentSpots.length) {
      setError(
        `Pool only has ${resolvedPool.length} items but you have ${currentSpots.length} spots — add more or reduce the spot count.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/breaks", {
        method: "POST",
        body: JSON.stringify({
          streamId,
          breakName: breakName.trim(),
          breakDescription: breakDescription.trim() || undefined,
          sellingMode,
          spotType,
          assignmentMode,
          spotPool: resolvedPool,
          spotPreset,
          consolationPrize: consolationPrize.trim() || undefined,
          shippingProfile,
          autoRandomize,
          quickSpin,
          spots: currentSpots.map((s) => ({
            spotName: s.spotName,
            startingPrice: s.startingPrice,
            description: s.description || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || "Failed to create break.");
        return;
      }
      onCreated();
      reset();
      onClose();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const copy = spotTypeCopy(spotType);
  const presetSize = poolByPreset[spotPreset]?.length ?? 0;

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="Create a Break"
        size="lg"
        variant="dark"
        footer={
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="h-10 px-4 rounded-lg text-sm font-medium border border-white/15 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {submitting ? "Creating…" : "Create Break"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {/* ── Quick Start ─────────────────────────────────────────── */}
          <section>
            <SectionHeader
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="Quick Start"
              hint="Pick a template — you can still tweak everything below."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BREAK_TEMPLATES.map((t) => (
                <TemplateTile
                  key={t.id}
                  template={t}
                  selected={templateId === t.id}
                  onClick={() => applyTemplate(t.id)}
                />
              ))}
            </div>
          </section>

          <hr className="border-white/10" />

          {/* ── Selling mode ─────────────────────────────────────────── */}
          <div>
            <div className="inline-flex rounded-full bg-white/5 p-1 border border-white/10">
              {(["buy_it_now", "auction"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSellingMode(m)}
                  className={cn(
                    "px-5 h-9 rounded-full text-sm font-medium transition-colors",
                    sellingMode === m ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
                  )}
                >
                  {m === "buy_it_now" ? "Buy it Now" : "Auction"}
                </button>
              ))}
            </div>
          </div>

          <Field label="Break Name" required>
            <input
              type="text"
              value={breakName}
              onChange={(e) => setBreakName(e.target.value)}
              placeholder="2024 Bowman Chrome Hobby Box Break"
              maxLength={120}
              className="dark-input"
            />
          </Field>

          <Field label="Break Description">
            <textarea
              value={breakDescription}
              onChange={(e) => setBreakDescription(e.target.value)}
              placeholder="Describe the product, hits, or promo for buyers."
              maxLength={2000}
              rows={3}
              className="dark-input resize-y min-h-20"
            />
          </Field>

          {/* ── Format ───────────────────────────────────────────────── */}
          <SectionHeader title="Format" />

          <Field label="Spot Type" hint="What's behind each spot?">
            <select
              value={spotType}
              onChange={(e) => setSpotType(e.target.value as SpotType)}
              className="dark-input"
            >
              {SPOT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assignment Mode" hint="How does each spot get matched to its content?">
            <select
              value={assignmentMode}
              onChange={(e) => setAssignmentMode(e.target.value as AssignmentMode)}
              className="dark-input"
            >
              {ASSIGNMENT_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-white/50">
              {ASSIGNMENT_MODE_OPTIONS.find((o) => o.value === assignmentMode)?.hint}
            </p>
          </Field>

          <Field label={`${copy.singular === "spot" ? "Spot" : capitalize(copy.singular)} Pool Source`}>
            <select
              value={spotPreset}
              onChange={(e) => setSpotPreset(e.target.value)}
              className="dark-input"
            >
              {PRESET_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {presetSize > 0 && spotPreset !== "custom" && (
              <p className="mt-1.5 text-xs text-white/50">
                {presetSize} {copy.plural} in this preset.
              </p>
            )}
          </Field>

          <Field label="Number of Spots">
            <input
              type="number"
              min={2}
              max={500}
              value={numberOfSpots}
              onChange={(e) =>
                setNumberOfSpots(Math.max(2, Math.min(500, parseInt(e.target.value) || 2)))
              }
              className="dark-input"
              disabled={assignmentMode === "pick_your" && spotPreset !== "custom"}
            />
            {assignmentMode === "pick_your" && spotPreset !== "custom" && (
              <p className="mt-1.5 text-xs text-white/50">
                Pick-your with a preset uses one spot per {copy.singular} ({presetSize}).
              </p>
            )}
          </Field>

          {(spotPreset === "custom" || assignmentMode === "pick_your") && (
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="self-start inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-white/20 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Manage {capitalize(copy.plural)} and Pricing ({currentSpots.length})
            </button>
          )}

          {spotType === "character" && (
            <Field
              label="Consolation Prize (optional)"
              hint="Extra item every buyer gets in addition to their character."
            >
              <input
                type="text"
                value={consolationPrize}
                onChange={(e) => setConsolationPrize(e.target.value)}
                placeholder="e.g. Korean Booster Pack"
                maxLength={120}
                className="dark-input"
              />
            </Field>
          )}

          <hr className="border-white/10" />

          {/* ── Reveal behaviour ─────────────────────────────────────── */}
          <SectionHeader
            title="Reveal Settings"
            hint={
              assignmentMode === "pick_your"
                ? "Pick-your has no reveal — buyers already know what they bought."
                : assignmentMode === "random_at_end"
                  ? "Random-at-end reveals all spots at once when the break finishes."
                  : "Tune how each per-spot reveal feels."
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DarkToggle
              label="Auto-Randomize"
              description={
                autoRandomize
                  ? "Spin auto-fires after each win."
                  : "You'll click Spin Now in the seller panel for each win."
              }
              checked={autoRandomize}
              onChange={setAutoRandomize}
              disabled={assignmentMode === "pick_your" || assignmentMode === "random_at_end"}
            />
            <DarkToggle
              label="Quick Spin"
              description={
                quickSpin
                  ? "3-second spin animation."
                  : "6-second slow-burn spin animation."
              }
              checked={quickSpin}
              onChange={setQuickSpin}
              disabled={assignmentMode === "pick_your" || assignmentMode === "random_at_end"}
            />
          </div>

          <hr className="border-white/10" />

          <div>
            <h3 className="text-sm font-semibold mb-3">Break Details</h3>
            <Field label="Shipping Profile">
              <select
                value={shippingProfile}
                onChange={(e) => setShippingProfile(e.target.value)}
                className="dark-input"
              >
                {(presets?.shippingProfiles ?? []).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} {p.description ? `— ${p.description}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </Modal>

      <ManageSpotsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        spots={currentSpots}
        onSave={(rows) => {
          setPoolForCurrent(rows);
          setManageOpen(false);
        }}
        title={`Manage ${capitalize(copy.plural)}`}
      />

      <style jsx>{`
        :global(.dark-input) {
          width: 100%;
          height: 2.75rem;
          padding: 0 0.75rem;
          border-radius: 0.5rem;
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          font-size: 0.875rem;
        }
        :global(.dark-input::placeholder) {
          color: rgba(255, 255, 255, 0.35);
        }
        :global(.dark-input:focus) {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px rgba(255, 214, 0, 0.2);
        }
        :global(.dark-input:disabled) {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      {hint && <p className="text-xs text-white/50 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function TemplateTile({
  template,
  selected,
  onClick,
}: {
  template: BreakTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-xl border transition-colors",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{template.name}</p>
        {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
      </div>
      <p className="text-xs text-white/50 mt-1 leading-snug">{template.description}</p>
    </button>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-white">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="ml-2 text-xs font-normal text-white/40">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function DarkToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/5",
        disabled && "opacity-50"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-white/50 mt-1 leading-snug">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-white/20",
          disabled && "cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
