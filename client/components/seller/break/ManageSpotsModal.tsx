"use client";

import { ChangeEvent, useState } from "react";
import { Plus, Trash2, ClipboardCopy, ClipboardPaste } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export interface SpotRow {
  id: string;
  spotName: string;
  startingPrice: number; // cents
  description: string;
}

interface ManageSpotsModalProps {
  open: boolean;
  onClose: () => void;
  spots: SpotRow[];
  onSave: (rows: SpotRow[]) => void;
  title?: string;
}

const MAX_SPOTS = 500;

function fmtPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parsePrice(value: string): number | null {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (cleaned === "") return 0;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

let counter = 0;
function nextId() {
  counter += 1;
  return `r${Date.now()}-${counter}`;
}

export function ManageSpotsModal(props: ManageSpotsModalProps) {
  if (!props.open) return null;
  return <ManageSpotsModalContent {...props} />;
}

function ManageSpotsModalContent({
  open,
  onClose,
  spots,
  onSave,
  title = "Manage Spots",
}: ManageSpotsModalProps) {
  const [rows, setRows] = useState<SpotRow[]>(() => (spots.length ? spots : []));
  const [copied, setCopied] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const updateRow = (id: string, patch: Partial<SpotRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    if (rows.length >= MAX_SPOTS) return;
    setRows((prev) => [
      ...prev,
      { id: nextId(), spotName: "", startingPrice: 100, description: "" },
    ]);
  };

  const handleCopy = async () => {
    const tsv = rows
      .map((r) => `${r.spotName}\t${fmtPrice(r.startingPrice)}\t${r.description}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const applyPaste = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const parsed: SpotRow[] = [];
    for (const line of lines.slice(0, MAX_SPOTS)) {
      const cells = line.split("\t");
      const spotName = (cells[0] ?? "").trim();
      if (!spotName) continue;
      const priceCents = parsePrice(cells[1] ?? "1.00") ?? 100;
      parsed.push({
        id: nextId(),
        spotName,
        startingPrice: priceCents,
        description: (cells[2] ?? "").trim(),
      });
    }
    if (parsed.length === 0) return;
    setRows(parsed);
    setPasteOpen(false);
    setPasteText("");
  };

  const handlePriceChange = (id: string, e: ChangeEvent<HTMLInputElement>) => {
    const cents = parsePrice(e.target.value);
    if (cents === null) return;
    updateRow(id, { startingPrice: cents });
  };

  const valid = rows.length > 0 && rows.every((r) => r.spotName.trim().length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Add up to 500 spots. Tab between cells. Paste from a spreadsheet to bulk-import."
      size="xl"
      variant="dark"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg text-sm font-medium border border-white/15 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(rows)}
            disabled={!valid}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Confirm ({rows.length})
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_SPOTS}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/15 text-xs font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/15 text-xs font-medium hover:bg-white/5 transition-colors"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Paste from Spreadsheet
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/15 text-xs font-medium hover:bg-white/5 transition-colors"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy All"}
          </button>
          <span className="ml-auto text-xs text-white/50">{rows.length} / {MAX_SPOTS}</span>
        </div>

        {pasteOpen && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex flex-col gap-2">
            <p className="text-xs text-white/60">
              Paste tab-separated rows: <code>Spot Name &lt;TAB&gt; Starting Price &lt;TAB&gt; Description</code>.
              Replaces the current list.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Tennessee Titans\t1.00\nGreen Bay Packers\t1.00"}
              rows={6}
              className="w-full rounded-md border border-white/15 bg-neutral-950 text-white text-xs font-mono px-2 py-2 focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="h-8 px-3 rounded-md text-xs hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyPaste}
                disabled={!pasteText.trim()}
                className="h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[40px_1fr_140px_1fr_40px] bg-white/5 text-xs font-semibold text-white/70 px-3 py-2">
            <span>#</span>
            <span>Spot Name</span>
            <span>Starting Price</span>
            <span>Description</span>
            <span></span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-white/5">
            {rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-white/50">No spots yet — add a row to begin.</p>
            ) : (
              rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[40px_1fr_140px_1fr_40px] items-center px-3 py-1.5 hover:bg-white/5"
                >
                  <span className="text-xs text-white/40 tabular-nums">{idx + 1}</span>
                  <input
                    type="text"
                    value={row.spotName}
                    onChange={(e) => updateRow(row.id, { spotName: e.target.value })}
                    placeholder="Spot name"
                    className="bg-transparent text-sm focus:outline-none focus:bg-white/5 px-2 py-1.5 rounded"
                  />
                  <div className="flex items-center bg-transparent rounded">
                    <span className="text-white/40 text-sm pl-2">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fmtPrice(row.startingPrice)}
                      onChange={(e) => handlePriceChange(row.id, e)}
                      className="w-full bg-transparent text-sm focus:outline-none focus:bg-white/5 px-1.5 py-1.5 rounded text-right"
                    />
                  </div>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateRow(row.id, { description: e.target.value })}
                    placeholder="Optional"
                    className="bg-transparent text-sm focus:outline-none focus:bg-white/5 px-2 py-1.5 rounded text-white/70"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label="Delete row"
                    className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
