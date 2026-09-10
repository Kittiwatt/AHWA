// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.
// Registre des scénarios jouables (définitions figées dans public/scenarios/).
import s0 from "../public/scenarios/boa_queen_of_ash.json";
import s1 from "../public/scenarios/boa_smoke_and_mirrors.json";
import s2 from "../public/scenarios/boa_spreading_flames.json";
import s3 from "../public/scenarios/cob_blood_money.json";
import s4 from "../public/scenarios/cob_new_horizons.json";
import s5 from "../public/scenarios/cob_river_of_blood.json";
import s6 from "../public/scenarios/notz_the_devourer_below.json";
import s7 from "../public/scenarios/notz_the_gathering.json";
import s8 from "../public/scenarios/notz_the_midnight_masks.json";
import s9 from "../public/scenarios/tcu_at_deaths_doorstep.json";
import s10 from "../public/scenarios/tcu_before_the_black_throne.json";
import s11 from "../public/scenarios/tcu_for_the_greater_good.json";
import s12 from "../public/scenarios/tcu_in_the_clutches_of_chaos.json";
import s13 from "../public/scenarios/tcu_secret_name.json";
import s14 from "../public/scenarios/tcu_union_and_disillusion.json";
import s15 from "../public/scenarios/tcu_wages_of_sin.json";
import s16 from "../public/scenarios/tcu_witching_hour.json";
import s17 from "../public/scenarios/tic_a_light_in_the_fog.json";
import s18 from "../public/scenarios/tic_devil_reef.json";
import s19 from "../public/scenarios/tic_horror_in_high_gear.json";
import s20 from "../public/scenarios/tic_in_too_deep.json";
import s21 from "../public/scenarios/tic_into_the_maelstrom.json";
import s22 from "../public/scenarios/tic_the_lair_of_dagon.json";
import s23 from "../public/scenarios/tic_the_pit_of_despair.json";
import s24 from "../public/scenarios/tic_the_vanishing_of_elina_harper.json";

export const SCENARIOS = {
  "boa_queen_of_ash": s0,
  "boa_smoke_and_mirrors": s1,
  "boa_spreading_flames": s2,
  "cob_blood_money": s3,
  "cob_new_horizons": s4,
  "cob_river_of_blood": s5,
  "notz_the_devourer_below": s6,
  "notz_the_gathering": s7,
  "notz_the_midnight_masks": s8,
  "tcu_at_deaths_doorstep": s9,
  "tcu_before_the_black_throne": s10,
  "tcu_for_the_greater_good": s11,
  "tcu_in_the_clutches_of_chaos": s12,
  "tcu_secret_name": s13,
  "tcu_union_and_disillusion": s14,
  "tcu_wages_of_sin": s15,
  "tcu_witching_hour": s16,
  "tic_a_light_in_the_fog": s17,
  "tic_devil_reef": s18,
  "tic_horror_in_high_gear": s19,
  "tic_in_too_deep": s20,
  "tic_into_the_maelstrom": s21,
  "tic_the_lair_of_dagon": s22,
  "tic_the_pit_of_despair": s23,
  "tic_the_vanishing_of_elina_harper": s24,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
