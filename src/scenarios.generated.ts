// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/notz_the_devourer_below.json";
import s1 from "../public/scenarios/notz_the_gathering.json";
import s2 from "../public/scenarios/notz_the_midnight_masks.json";
import s3 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s4 from "../public/scenarios/tcu_for_the_greater_good.json";
import s5 from "../public/scenarios/tcu_in_the_clutches_of_chaos.json";
import s6 from "../public/scenarios/tcu_secret_name.json";
import s7 from "../public/scenarios/tcu_union_and_disillusion.json";
import s8 from "../public/scenarios/tcu_wages_of_sin.json";
import s9 from "../public/scenarios/tcu_witching_hour.json";

export const SCENARIOS = {
  "notz_the_devourer_below": s0,
  "notz_the_gathering": s1,
  "notz_the_midnight_masks": s2,
  "tcu_at_deaths_doorstep": s3,
  "tcu_for_the_greater_good": s4,
  "tcu_in_the_clutches_of_chaos": s5,
  "tcu_secret_name": s6,
  "tcu_union_and_disillusion": s7,
  "tcu_wages_of_sin": s8,
  "tcu_witching_hour": s9,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
