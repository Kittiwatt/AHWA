// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/notz_the_gathering.json";
import s1 from "../public/scenarios/notz_the_midnight_masks.json";

export const SCENARIOS = {
  "notz_the_gathering": s0,
  "notz_the_midnight_masks": s1,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
