/** Return two numbers from the normal distribution with the given mean and standard deviation */
export function gaussianRandom(mean = 0, sd = 1) {
   let u = Math.random();
   let v = Math.random();
   while (u === 0) u = Math.random();
   while (v === 0) v = Math.random();

   const r = Math.sqrt(-2 * Math.log(u));
   const theta = 2 * Math.PI * v;

   const x = r * Math.cos(theta);
   const y = r * Math.sin(theta);

   return [mean + x * sd, mean + y * sd];
}

/** Scale up a number from (0, 1) */
export const logit = (x: number) => Math.log(x / (1 - x));
/** Scale down a number into (0, 1) */
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function stdev(...values: number[]) {
   const avg = values.reduce((s, n) => s + n);
   const mean = avg / values.length;
   const variance = values.reduce((sum, n) => sum + (n - mean) * (n - mean), 0);
   return Math.sqrt(variance / (values.length - 1));
}

export default {
   gaussianRandom,
   logit,
   sigmoid,
   stdev
};
