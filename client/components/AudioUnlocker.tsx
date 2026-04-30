"use client";

import { useEffect } from "react";
import { unlockAudio } from "@/lib/sound-effects";

/**
 * Mount once near the app root. The first time the user touches/clicks/types
 * anywhere on the page, we boot the AudioContext so subsequent server-driven
 * sound effects (reveals, wins) can play without their own gesture.
 *
 * The listeners are passive + capture so they fire before anything stops them,
 * and they self-remove after the first successful unlock.
 */
export function AudioUnlocker() {
  useEffect(() => {
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      unlockAudio();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("touchstart", handler, true);
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("keydown", handler, true);
    window.addEventListener("touchstart", handler, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("touchstart", handler, true);
    };
  }, []);

  return null;
}
