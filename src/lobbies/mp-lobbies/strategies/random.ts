import { Rating, ModMultipliers } from "../../../types/global";
import { Mappool } from "../../../types/lobby";
import IStrategy from "./strategy";

class RandomStrategy implements IStrategy {
   #randomPick(pool: Mappool): number {
      const availablePools = (Object.keys(pool) as (keyof Mappool)[]).filter(mod => pool[mod].length > 0);
      const chosenPool = availablePools[(Math.random() * availablePools.length) | 0];
      const availableMaps = pool[chosenPool];
      return availableMaps[(Math.random() * availableMaps.length) | 0];
   }

   banMap(pool: Mappool): number {
      return this.#randomPick(pool);
   }
   initPlayer(player: { rating: Rating; mods: ModMultipliers; skills: number[]; }) {
      // Player doesn't matter for random picker
   }
   pickMap(pool: Mappool): number {
      return this.#randomPick(pool);
   }
}

export default RandomStrategy;
