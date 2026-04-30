"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  { value: "custom", label: "Custom" },
];

const DEFAULT_STARTING_PRICE = 100; // $1 in cents

function presetToSpots(names: string[]): SpotRow[] {
  return names.map((n, i) => ({
    id: `${i}`,
    spotName: n,
    startingPrice: DEFAULT_STARTING_PRICE,
    description: "",
  }));
}

export function BreakCreationModal({
  open,
  onClose,
  streamId,
  onCreated,
}: BreakCreationModalProps) {
  const [mode, setMode] = useState<"buy_it_now" | "auction">("auction");
  const [breakName, setBreakName] = useState("");
  const [breakDescription, setBreakDescription] = useState("");
  const [breakFormat, setBreakFormat] = useState<"pick_your" | "random">("pick_your");
  const [spotPreset, setSpotPreset] = useState<string>("nfl_teams");
  const [numberOfSpots, setNumberOfSpots] = useState<number>(32);
  const [shippingProfile, setShippingProfile] = useState("4-7oz");
  const [autoRandomize, setAutoRandomize] = useState(true);
  const [quickSpin, setQuickSpin] = useState(true);
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [spotsByPreset, setSpotsByPreset] = useState<Record<string, SpotRow[]>>({});
  const [customSpots, setCustomSpots] = useState<SpotRow[]>([]);
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
        const seeded: Record<string, SpotRow[]> = {};
        for (const [k, names] of Object.entries(data.presets)) {
          if (k === "custom") continue;
          seeded[k] = presetToSpots(names);
        }
        setSpotsByPreset(seeded);
      });
  }, [open, presets]);

  const currentSpots: SpotRow[] = useMemo(() => {
    if (breakFormat === "random") {
      return Array.from({ length: numberOfSpots }, (_, i) => ({
        id: `r-${i}`,
        spotName: `Spot #${i + 1}`,
        startingPrice: DEFAULT_STARTING_PRICE,
        description: "",
      }));
    }
    if (spotPreset === "custom") return customSpots;
    return spotsByPreset[spotPreset] ?? [];
  }, [breakFormat, numberOfSpots, spotPreset, customSpots, spotsByPreset]);

  const setSpotsForCurrent = (rows: SpotRow[]) => {
    if (breakFormat === "random") return; // Random spots are derived; ignore.
    if (spotPreset === "custom") setCustomSpots(rows);
    else setSpotsByPreset((prev) => ({ ...prev, [spotPreset]: rows }));
  };

  const reset = () => {
    setMode("auction");
    setBreakName("");
    setBreakDescription("");
    setBreakFormat("pick_your");
    setSpotPreset("nfl_teams");
    setNumberOfSpots(32);
    setShippingProfile("4-7oz");
    setAutoRandomize(true);
    setQuickSpin(true);
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
    setSubmitting(true);
    try {
      const res = await apiFetch("/breaks", {
        method: "POST",
        body: JSON.stringify({
          streamId,
          breakName: breakName.trim(),
          breakDescription: breakDescription.trim() || undefined,
          sellingMode: mode,
          breakFormat,
          spotPreset: breakFormat === "random" ? undefined : spotPreset,
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
          {/* Pill toggle: Buy it Now / Auction */}
          <div>
            <div className="inline-flex rounded-full bg-white/5 p-1 border border-white/10">
              {(["buy_it_now", "auction"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-5 h-9 rounded-full text-sm font-medium transition-colors",
                    mode === m ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
                  )}
                >
                  {m === "buy_it_now" ? "Buy it Now" : "Auction"}
                </button>
              ))}
            </div>
          </div>

          {/* Break Name */}
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

          <Field label="Break Format">
            <select
              value={breakFormat}
              onChange={(e) => setBreakFormat(e.target.value as "pick_your" | "random")}
              className="dark-input"
            >
              <option value="pick_your">Pick Your</option>
              <option value="random">Random</option>
            </select>
          </Field>

          {breakFormat === "pick_your" && (
            <>
              <Field label="Spot Preset">
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
              </Field>

              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="self-start inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-white/20 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Manage Spots and Pricing ({currentSpots.length})
              </button>
            </>
          )}

          {breakFormat === "random" && (
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
              />
            </Field>
          )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DarkToggle
              label="Auto-Randomize"
              description="When ON, the random spin runs automatically after each spot is sold."
              checked={autoRandomize}
              onChange={setAutoRandomize}
            />
            <DarkToggle
              label="Quick Spin"
              description="Use the faster (3s) spin animation. Turn off for a slower (6s) reveal."
              checked={quickSpin}
              onChange={setQuickSpin}
            />
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
          setSpotsForCurrent(rows);
          setManageOpen(false);
        }}
        title={presetTitle(spotPreset)}
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
      `}</style>
    </>
  );
}

function presetTitle(preset: string): string {
  const opt = PRESET_OPTIONS.find((p) => p.value === preset);
  return opt ? `Manage Spots — ${opt.label}` : "Manage Spots";
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-white">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
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
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-white/50 mt-1 leading-snug">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-white/20"
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
