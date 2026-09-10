// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/boa_spreading_flames.json";
import s1 from "../public/scenarios/cob_blood_money.json";
import s2 from "../public/scenarios/cob_new_horizons.json";
import s3 from "../public/scenarios/cob_river_of_blood.json";
import s4 from "../public/scenarios/notz_the_devourer_below.json";
import s5 from "../public/scenarios/notz_the_gathering.json";
import s6 from "../public/scenarios/notz_the_midnight_masks.json";
import s7 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s8 from "../public/scenarios/tcu_before_the_black_throne.json";
import s9 from "../public/scenarios/tcu_for_the_greater_good.json";
import s10 from "../public/scenarios/tcu_in_the_clutches_of_chaos.json";
import s11 from "../public/scenarios/tcu_secret_name.json";
import s12 from "../public/scenarios/tcu_union_and_disillusion.json";
import s13 from "../public/scenarios/tcu_wages_of_sin.json";
import s14 from "../public/scenarios/tcu_witching_hour.json";
import s15 from "../public/scenarios/tic_a_light_in_the_fog.json";
import s16 from "../public/scenarios/tic_devil_reef.json";
import s17 from "../public/scenarios/tic_horror_in_high_gear.json";
import s18 from "../public/scenarios/tic_in_too_deep.json";
import s19 from "../public/scenarios/tic_into_the_maelstrom.json";
import s20 from "../public/scenarios/tic_the_lair_of_dagon.json";
import s21 from "../public/scenarios/tic_the_pit_of_despair.json";
import s22 from "../public/scenarios/tic_the_vanishing_of_elina_harper.json";

export const SCENARIOS = {
  "boa_spreading_flames": s0,
  "cob_blood_money": s1,
  "cob_new_horizons": s2,
  "cob_river_of_blood": s3,
  "notz_the_devourer_below": s4,
  "notz_the_gathering": s5,
  "notz_the_midnight_masks": s6,
  "tcu_at_deaths_doorstep": s7,
  "tcu_before_the_black_throne": s8,
  "tcu_for_the_greater_good": s9,
  "tcu_in_the_clutches_of_chaos": s10,
  "tcu_secret_name": s11,
  "tcu_union_and_disillusion": s12,
  "tcu_wages_of_sin": s13,
  "tcu_witching_hour": s14,
  "tic_a_light_in_the_fog": s15,
  "tic_devil_reef": s16,
  "tic_horror_in_high_gear": s17,
  "tic_in_too_deep": s18,
  "tic_into_the_maelstrom": s19,
  "tic_the_lair_of_dagon": s20,
  "tic_the_pit_of_despair": s21,
  "tic_the_vanishing_of_elina_harper": s22,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
