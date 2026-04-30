"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Link2, Copy, Globe, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { SectionNav } from "./components/SectionNav";
import {
  Section,
  Field,
  ToggleRow,
  Input,
  Textarea,
  Select,
} from "./components/FormPrimitives";
import { CategoryPicker } from "./components/CategoryPicker";
import { SellingFormatPicker } from "./components/SellingFormatPicker";
import { ShowTagsInput } from "./components/ShowTagsInput";
import { MediaUploader } from "./components/MediaUploader";
import { makeDefaultShowFormState, ShowFormState } from "./types";

const DRAFT_KEY = "show_draft_v1";

function loadDraft(): Partial<ShowFormState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<ShowFormState>) : null;
  } catch {
    return null;
  }
}

function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const local = new Date(`${date}T${time}`);
  if (isNaN(local.getTime())) return null;
  return local.toISOString();
}

function repeatDescription(form: ShowFormState): string {
  if (form.repeats === "none") return "Does not repeat";
  if (form.repeats === "daily") return "Daily";
  if (!form.date) return form.repeats === "weekly" ? "Weekly" : "Monthly";
  const d = new Date(`${form.date}T${form.time || "00:00"}`);
  if (isNaN(d.getTime())) return "Repeats";
  if (form.repeats === "weekly") {
    return `Weekly on ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  }
  return `Monthly on day ${d.getDate()}`;
}

export default function ScheduleShowPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [form, setForm] = useState<ShowFormState>(() => {
    const draft = loadDraft();
    return { ...makeDefaultShowFormState(), ...(draft ?? {}) };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Autosave every 5 seconds.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // storage may be full or disabled
      }
    }, 5000);
    return () => clearInterval(id);
  }, [form]);

  // Auth gate.
  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (!user.isSellerEnabled) router.replace("/");
  }, [user, isLoading, router]);

  const update = <K extends keyof ShowFormState>(key: K, value: ShowFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string | null => {
    if (form.title.trim().length < 3) return "Show title must be at least 3 characters.";
    if (!form.primaryCategory) return "Pick a primary category.";
    if (!form.thumbnailUrl) return "Upload a thumbnail before scheduling.";
    const iso = combineDateTime(form.date, form.time);
    if (!iso) return "Pick a valid date and time.";
    if (new Date(iso).getTime() <= Date.now())
      return "Show must be scheduled in the future.";
    return null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    const iso = combineDateTime(form.date, form.time);
    if (!iso) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const res = await apiFetch("/streams/schedule", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          scheduledStartAt: iso,
          primaryCategory: form.primaryCategory,
          primarySubcategory: form.primarySubcategory || undefined,
          primarySellingFormat: "breaks",
          tags: form.tags,
          thumbnailUrl: form.thumbnailUrl,
          videoPreviewUrl: form.videoPreviewUrl || undefined,
          freePickupEnabled: form.freePickupEnabled,
          pickupAddressId: form.freePickupEnabled ? form.pickupAddressId || undefined : undefined,
          pickupInstructions: form.freePickupEnabled
            ? form.pickupInstructions || undefined
            : undefined,
          domesticShippingFee:
            form.domesticShippingFee.trim() === ""
              ? undefined
              : Math.round(parseFloat(form.domesticShippingFee) * 100),
          combinedShippingEnabled: form.combinedShippingEnabled,
          visibility: form.visibility,
          notifyFollowers: form.notifyFollowers,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || "Failed to schedule show.");
        return;
      }

      // Clear draft on success.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}

      router.push("/seller/dashboard");
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("whatnot:seller-dashboard-refresh"));
        }, 0);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push("/seller/dashboard");
  };

  if (isLoading || !user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F5]">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 pb-32">
        <header className="mb-8 flex items-center gap-3">
          <Link
            href="/seller/dashboard"
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Schedule a Show</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          <SectionNav />

          <div className="flex flex-col gap-6 min-w-0">
            {/* Show Information */}
            <Section
              id="show-info"
              title="Show Information"
              description="The basics about your show."
            >
              <div className="flex flex-col gap-5">
                <Field label="Name your show" htmlFor="show-title" required>
                  <Input
                    id="show-title"
                    value={form.title}
                    maxLength={120}
                    placeholder="Sunday Night Pokémon Breaks"
                    onChange={(e) => update("title", e.target.value)}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Show Date" htmlFor="show-date" required>
                    <Input
                      id="show-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => update("date", e.target.value)}
                      prefix={<Calendar className="h-4 w-4" />}
                    />
                  </Field>
                  <Field label="Show Time" htmlFor="show-time" required>
                    <Input
                      id="show-time"
                      type="time"
                      value={form.time}
                      onChange={(e) => update("time", e.target.value)}
                      prefix={<Clock className="h-4 w-4" />}
                    />
                  </Field>
                </div>

                <Field label="Repeats" htmlFor="show-repeats" hint={repeatDescription(form)}>
                  <Select
                    id="show-repeats"
                    value={form.repeats}
                    onChange={(e) =>
                      update("repeats", e.target.value as ShowFormState["repeats"])
                    }
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </Field>

                <hr className="border-border" />

                <Field
                  label="Primary Category"
                  required
                  hint="Accurately categorizing your show will help to increase its discoverability."
                >
                  <CategoryPicker
                    category={form.primaryCategory}
                    subcategory={form.primarySubcategory}
                    onChange={(c, s) => {
                      setForm((prev) => ({
                        ...prev,
                        primaryCategory: c,
                        primarySubcategory: s,
                        // reset tags when the category changes — old tags may not be relevant
                        tags:
                          c === prev.primaryCategory && s === prev.primarySubcategory
                            ? prev.tags
                            : [],
                      }));
                    }}
                  />
                </Field>

                <Field
                  label="Primary Selling Format"
                  required
                  hint="Choose the selling format that you plan to use most often in your show. This information helps buyers discover your show."
                >
                  <SellingFormatPicker
                    value={form.primarySellingFormat}
                    onChange={(v) => update("primarySellingFormat", v)}
                  />
                </Field>

                <Field
                  label="Show Tags"
                  hint="Pick up to 5 tags that describe your show. Buyers use these to find shows like yours."
                >
                  <ShowTagsInput
                    selectedTags={form.tags}
                    category={form.primaryCategory}
                    subcategory={form.primarySubcategory}
                    onChange={(t) => update("tags", t)}
                  />
                </Field>
              </div>
            </Section>

            {/* Media */}
            <Section
              id="media"
              title="Media"
              description="Add a thumbnail and video preview to maximize your show's exposure on Whatnot."
            >
              <MediaUploader
                thumbnailUrl={form.thumbnailUrl}
                videoPreviewUrl={form.videoPreviewUrl}
                onChange={(next) =>
                  setForm((prev) => ({
                    ...prev,
                    ...(next.thumbnailUrl !== undefined && { thumbnailUrl: next.thumbnailUrl }),
                    ...(next.videoPreviewUrl !== undefined && {
                      videoPreviewUrl: next.videoPreviewUrl,
                    }),
                  }))
                }
              />
            </Section>

            {/* Shipping Settings */}
            <Section
              id="shipping"
              title="Shipping Settings"
              description="Adjusts your defaults for domestic shipments, shipping costs, and local pickup for this show."
            >
              <ToggleRow
                label="Free Pickup"
                description="Let buyers pick up items in person for free."
                checked={form.freePickupEnabled}
                onChange={(v) => update("freePickupEnabled", v)}
              />

              {form.freePickupEnabled && (
                <div className="ml-0 mt-2 mb-4 flex flex-col gap-3 p-4 bg-secondary/50 rounded-lg border border-border">
                  <Field label="Pickup Address">
                    <Select
                      value={form.pickupAddressId}
                      onChange={(e) => update("pickupAddressId", e.target.value)}
                    >
                      <option value="">Select a saved address…</option>
                      {/* Address book deferred — placeholder only */}
                    </Select>
                    <p className="text-xs text-muted-foreground -mt-1">
                      No saved addresses yet. Address book is coming soon — for now you can add
                      pickup details in the instructions below.
                    </p>
                  </Field>
                  <Field
                    label="Instructions"
                    hint="This address will be visible to viewers within shows when Free Pickup is enabled."
                  >
                    <Textarea
                      rows={3}
                      value={form.pickupInstructions}
                      onChange={(e) => update("pickupInstructions", e.target.value)}
                      placeholder="e.g. After winning, message me to coordinate a time. Pickup at 123 Main St, Open 10am–6pm."
                    />
                  </Field>
                </div>
              )}

              <hr className="border-border my-3" />

              <p className="text-sm font-semibold mb-3">Domestic Shipments</p>

              <Field
                label="Default shipping fee per item"
                hint="Charged to the buyer for each item won. Leave blank to use Whatnot defaults."
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.domesticShippingFee}
                  onChange={(e) => update("domesticShippingFee", e.target.value)}
                  prefix="$"
                  placeholder="5.00"
                />
              </Field>

              <ToggleRow
                label="Combined shipping"
                description="Charge buyers a single shipping fee regardless of how many items they win."
                checked={form.combinedShippingEnabled}
                onChange={(v) => update("combinedShippingEnabled", v)}
              />
            </Section>

            {/* Visibility */}
            <Section
              id="visibility"
              title="Visibility"
              description="Choose who can find and join this show."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <VisibilityCard
                  active={form.visibility === "public"}
                  icon={<Globe className="h-5 w-5" />}
                  title="Public"
                  description="Listed on the home feed and discoverable by anyone."
                  onClick={() => update("visibility", "public")}
                />
                <VisibilityCard
                  active={form.visibility === "private"}
                  icon={<Lock className="h-5 w-5" />}
                  title="Private"
                  description="Invite only — share the show link directly with your buyers."
                  onClick={() => update("visibility", "private")}
                />
              </div>
            </Section>

            {/* Promote Show */}
            <Section
              id="promote"
              title="Promote Show"
              description="Share your show with your audience."
            >
              <div className="flex flex-col gap-4">
                <ToggleRow
                  label="Notify followers"
                  description="Auto-ping your followers 15 minutes before the show starts."
                  checked={form.notifyFollowers}
                  onChange={(v) => update("notifyFollowers", v)}
                />

                <hr className="border-border" />

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-secondary/50 cursor-not-allowed"
                    title="Available after the show is scheduled"
                  >
                    <Link2 className="h-4 w-4" />
                    Generate shareable link
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-secondary/50 cursor-not-allowed"
                    title="Available after the show is scheduled"
                  >
                    <Copy className="h-4 w-4" />
                    Embed code
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sharing tools unlock once your show is created. You&rsquo;ll find them on the
                  Upcoming Shows card on your dashboard.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </main>

      {/* Floating action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Draft autosaves every 5 seconds.
          </p>
          {error ? (
            <p className="text-xs text-destructive flex-1 sm:flex-none">{error}</p>
          ) : null}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="h-10 px-4 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {submitting ? "Scheduling…" : "Schedule Show"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisibilityCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border p-4 transition-colors flex items-start gap-3 ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:bg-secondary"
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full ${
          active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
          {description}
        </span>
      </span>
      <span
        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
          active ? "border-primary bg-primary" : "border-border"
        }`}
      />
    </button>
  );
}
