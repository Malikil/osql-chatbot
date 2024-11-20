import { BanchoUser } from "bancho.js";
import { Rating } from "./global";

export interface MMPlayerObj {
   bancho: BanchoUser;
   rating: Rating
}

export interface Player {
   player: MMPlayerObj;
   rating: number;
   range: number;
}
