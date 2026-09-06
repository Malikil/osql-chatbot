import { ModMultipliers, Rating } from "../../../types/global";
import { Mappool } from "../../../types/lobby";

export default interface IStrategy {
   banMap(pool: Mappool): number;
   initPlayer(player: { rating: Rating; mods: ModMultipliers; skills: number[]; }): void;
   pickMap(pool: Mappool): number;
}
