// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/notz_the_devourer_below.json";
import s1 from "../public/scenarios/notz_the_gathering.json";
import s2 from "../public/scenarios/notz_the_midnight_masks.json";
import s3 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s4 from "../public/scenarios/tcu_secret_name.json";
import s5 from "../public/scenarios/tcu_witching_hour.json";

export const SCENARIOS = {
  "notz_the_devourer_below": s0,
  "notz_the_gathering": s1,
  "notz_the_midnight_masks": s2,
  "tcu_at_deaths_doorstep": s3,
  "tcu_secret_name": s4,
  "tcu_witching_hour": s5,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
