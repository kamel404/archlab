import type { Explanation } from "@/content/diagnosis";
import { TONE_CARD, TONE_TEXT } from "./tone";

export function ExplanationCard({
  eyebrow,
  explanation,
  stale = false,
  children,
  testId,
}: {
  eyebrow: string;
  explanation: Explanation;
  /** Dim while the slider is still moving and the text lags behind. */
  stale?: boolean;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-live="polite"
      data-testid={testId}
      className={`rounded-xl border p-4 transition-opacity ${TONE_CARD[explanation.tone]} ${stale ? "opacity-60" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{eyebrow}</p>
      <h3 className={`mt-1 text-lg font-semibold ${TONE_TEXT[explanation.tone]}`}>{explanation.headline}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{explanation.body}</p>
      {children}
    </section>
  );
}
