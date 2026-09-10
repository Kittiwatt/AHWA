// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/cob_blood_money.json";
import s1 from "../public/scenarios/cob_new_horizons.json";
import s2 from "../public/scenarios/cob_river_of_blood.json";
import s3 from "../public/scenarios/notz_the_devourer_below.json";
import s4 from "../public/scenarios/notz_the_gathering.json";
import s5 from "../public/scenarios/notz_the_midnight_masks.json";
import s6 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s7 from "../public/scenarios/tcu_before_the_black_throne.json";
import s8 from "../public/scenarios/tcu_for_the_greater_good.json";
import s9 from "../public/scenarios/tcu_in_the_clutches_of_chaos.json";
import s10 from "../public/scenarios/tcu_secret_name.json";
import s11 from "../public/scenarios/tcu_union_and_disillusion.json";
import s12 from "../public/scenarios/tcu_wages_of_sin.json";
import s13 from "../public/scenarios/tcu_witching_hour.json";
import s14 from "../public/scenarios/tic_devil_reef.json";
import s15 from "../public/scenarios/tic_horror_in_high_gear.json";
import s16 from "../public/scenarios/tic_in_too_deep.json";
import s17 from "../public/scenarios/tic_the_pit_of_despair.json";
import s18 from "../public/scenarios/tic_the_vanishing_of_elina_harper.json";

export const SCENARIOS = {
  "cob_blood_money": s0,
  "cob_new_horizons": s1,
  "cob_river_of_blood": s2,
  "notz_the_devourer_below": s3,
  "notz_the_gathering": s4,
  "notz_the_midnight_masks": s5,
  "tcu_at_deaths_doorstep": s6,
  "tcu_before_the_black_throne": s7,
  "tcu_for_the_greater_good": s8,
  "tcu_in_the_clutches_of_chaos": s9,
  "tcu_secret_name": s10,
  "tcu_union_and_disillusion": s11,
  "tcu_wages_of_sin": s12,
  "tcu_witching_hour": s13,
  "tic_devil_reef": s14,
  "tic_horror_in_high_gear": s15,
  "tic_in_too_deep": s16,
  "tic_the_pit_of_despair": s17,
  "tic_the_vanishing_of_elina_harper": s18,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
