import type { Status } from "@/engine";
import type { Tone } from "@/content/diagnosis";

export const STATUS_TONE: Record<Status, Tone> = { green: "good", amber: "warn", red: "bad" };

export const TONE_CARD: Record<Tone, string> = {
  good: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
  warn: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  bad: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
};

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-800 dark:text-emerald-300",
  warn: "text-amber-800 dark:text-amber-300",
  bad: "text-red-800 dark:text-red-300",
};

export const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

export const TONE_WORD: Record<Tone, string> = { good: "OK", warn: "Busy", bad: "Overloaded" };
