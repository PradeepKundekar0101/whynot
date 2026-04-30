"use client";

import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagsFor } from "@/lib/show-categories";

interface ShowTagsInputProps {
  selectedTags: string[];
  category: string;
  subcategory: string;
  onChange: (tags: string[]) => void;
  maxTags?: number;
}

export function ShowTagsInput({
  selectedTags,
  category,
  subcategory,
  onChange,
  maxTags = 5,
}: ShowTagsInputProps) {
  const suggestions = tagsFor(category, subcategory);
  const limitReached = selectedTags.length >= maxTags;

  const toggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else if (!limitReached) {
      onChange([...selectedTags, tag]);
    }
  };

  if (!category) {
    return (
      <p className="text-sm text-muted-foreground">
        Pick a category above to see suggested tags.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => toggle(tag)}
                className="hover:bg-black/10 rounded-full p-0.5"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-2">
          Suggested ({selectedTags.length}/{maxTags} selected)
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions
            .filter((t) => !selectedTags.includes(t))
            .map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                disabled={limitReached}
                className={cn(
                  "inline-flex items-center gap-1 pl-2.5 pr-3 py-1 text-xs rounded-full border transition-colors",
                  limitReached
                    ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                    : "border-border text-foreground hover:border-foreground/40 hover:bg-secondary"
                )}
              >
                <Plus className="h-3 w-3" />
                {tag}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
