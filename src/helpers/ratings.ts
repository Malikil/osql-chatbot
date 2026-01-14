import { Glicko2 } from "glicko2";
import { GameMode, Rating } from "../types/global";
import { logit, sigmoid } from "./mathplus";

const SIGMOID_WIDTH = 6;
// Updated: OWC'25 MWC7K'26
const MIN_ABSOLUTE = {
   osu: 92099,
   fruits: 500000,
   taiko: 300000,
   mania: 595268
};
export const MIN_TARGETS = {
   osu: 105432,
   fruits: 500000,
   taiko: 300000,
   mania: 630832
};
export const MAX_TARGETS = {
   osu: 892519,
   fruits: 900000,
   taiko: 900000,
   mania: 957745
};
const MAX_ABSOLUTE = {
   osu: 906084,
   fruits: 900000,
   taiko: 900000,
   mania: 963416
};

function matchResultValue(score: number, gamemode: GameMode) {
   const min: number = MIN_TARGETS[gamemode];
   const max: number = MAX_TARGETS[gamemode];
   const absMin = MIN_ABSOLUTE[gamemode];
   const absMax = MAX_ABSOLUTE[gamemode];

   if (score < absMin) return 0;
   if (score > absMax) return 1;

   const mid = (min + max) / 2;
   const width = max - min;
   const k = SIGMOID_WIDTH / width;
   const raw = sigmoid(k * (score - mid));

   const fMin = sigmoid(k * (absMin - mid));
   const fMax = sigmoid(k * (absMax - mid));

   return (raw - fMin) / (fMax - fMin);
}

function scoreFromResult(result: number, gamemode: GameMode) {
   if (result <= 0) return 0;
   if (result >= 1) return 1000000;
   const min = MIN_TARGETS[gamemode];
   const max = MAX_TARGETS[gamemode];
   const mid = (min + max) / 2;
   const width = max - min;
   const k = SIGMOID_WIDTH / width;
   // Avoid infinites
   const eps = 1e-9;
   const r = Math.min(1 - eps, Math.max(eps, result));
   const predictScore = mid + logit(r) / k;

   return Math.max(0, Math.min(predictScore, 1000000));
}

function predictOutcome(
   playerRating: Rating,
   mapRating: Rating,
   playerSkills: number[] = [],
   mapSkills: number[] = []
) {
   const calculator = new Glicko2();
   const playerCalc = calculator.makePlayer(playerRating.rating, playerRating.rd, playerRating.vol);
   const mapCalc = calculator.makePlayer(mapRating.rating, mapRating.rd, mapRating.vol);
   const simplePredict = calculator.predict(playerCalc, mapCalc);
   let residual = 0;
   for (let i = 0; i < playerSkills.length; i++) residual += playerSkills[i] * mapSkills[i];

   return sigmoid(logit(simplePredict) + residual);
}

export function effectiveRating(baseRating: Rating, mode: GameMode, modMult: number) {
   const baseOutcome = 0.5;
   const baseScore = scoreFromResult(baseOutcome, mode);
   const targetScore = baseScore / modMult;
   const targetOutcome = matchResultValue(targetScore, mode);
   console.log(`Rating: ${baseRating.rating.toFixed()} Multiplier: ${modMult.toFixed(2)}`);
   console.log(`Score: ${baseScore.toFixed()} / ${modMult.toFixed(2)} = ${targetScore.toFixed()}`);
   console.log(`Target outcome: ${targetOutcome.toFixed(4)}`);

   let [lo, hi] = [baseRating.rating, baseRating.rating * modMult * Math.sqrt(modMult)].sort(
      (a, b) => a - b
   );
   console.log(`Search ratings within ${lo.toFixed()} to ${hi.toFixed()}`);
   for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      const outcome = predictOutcome(baseRating, { ...baseRating, rating: mid });
      if (outcome > targetOutcome) lo = mid;
      else hi = mid;
   }
   console.log(`Found rating: ${((lo + hi) / 2).toFixed()}`);

   return (lo + hi) / 2;
}