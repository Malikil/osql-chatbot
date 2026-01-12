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
   logit,
   sigmoid,
   stdev
};
