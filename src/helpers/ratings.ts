import { Glicko2 } from "glicko2";
import { GameMode, Rating } from "../types/global";
import { logit, sigmoid } from "./mathplus";

const MIN_TARGETS = {
   osu: 100000,
   fruits: 500000,
   taiko: 300000,
   mania: 600000
};
const MAX_TARGETS = {
   osu: 900000,
   fruits: 900000,
   taiko: 900000,
   mania: 950000
};

function matchResultValue(
   score: number,
   gamemode: GameMode
) {
   const min: number = MIN_TARGETS[gamemode];
   const max: number = MAX_TARGETS[gamemode];

   if (score < min) return 0;
   if (score > max) return 1;

   const mid = (min + max) / 2;
   const width = max - min;
   const k = 4 / width;

   const fMin = sigmoid((-k * width) / 2);
   const fMax = sigmoid((k * width) / 2);
   const raw = sigmoid(k * (score - mid));

   return (raw - fMin) / (fMax - fMin);
}

function scoreFromResult(
   result: number,
   gamemode: GameMode
) {
   if (result <= 0) return 0;
   if (result >= 1) return 1000000;
   const min = MIN_TARGETS[gamemode];
   const max = MAX_TARGETS[gamemode];
   const mid = (min + max) / 2;
   const width = max - min;
   const k = 4 / width;
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

   let [lo, hi] = [baseRating.rating, baseRating.rating * modMult].sort((a, b) => a - b);
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