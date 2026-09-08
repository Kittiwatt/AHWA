// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/cob_new_horizons.json";
import s1 from "../public/scenarios/cob_river_of_blood.json";
import s2 from "../public/scenarios/notz_the_devourer_below.json";
import s3 from "../public/scenarios/notz_the_gathering.json";
import s4 from "../public/scenarios/notz_the_midnight_masks.json";
import s5 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s6 from "../public/scenarios/tcu_before_the_black_throne.json";
import s7 from "../public/scenarios/tcu_for_the_greater_good.json";
import s8 from "../public/scenarios/tcu_in_the_clutches_of_chaos.json";
import s9 from "../public/scenarios/tcu_secret_name.json";
import s10 from "../public/scenarios/tcu_union_and_disillusion.json";
import s11 from "../public/scenarios/tcu_wages_of_sin.json";
import s12 from "../public/scenarios/tcu_witching_hour.json";
import s13 from "../public/scenarios/tic_the_pit_of_despair.json";
import s14 from "../public/scenarios/tic_the_vanishing_of_elina_harper.json";

export const SCENARIOS = {
  "cob_new_horizons": s0,
  "cob_river_of_blood": s1,
  "notz_the_devourer_below": s2,
  "notz_the_gathering": s3,
  "notz_the_midnight_masks": s4,
  "tcu_at_deaths_doorstep": s5,
  "tcu_before_the_black_throne": s6,
  "tcu_for_the_greater_good": s7,
  "tcu_in_the_clutches_of_chaos": s8,
  "tcu_secret_name": s9,
  "tcu_union_and_disillusion": s10,
  "tcu_wages_of_sin": s11,
  "tcu_witching_hour": s12,
  "tic_the_pit_of_despair": s13,
  "tic_the_vanishing_of_elina_harper": s14,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
