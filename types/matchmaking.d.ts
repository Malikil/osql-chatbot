import { BanchoUser } from "bancho.js";

export interface MMPlayerObj {
   bancho: BanchoUser;
   rating: {
      rating: number;
      rd: number;
      vol: number;
   }
}

export interface Player {
   player: MMPlayerObj;
   rating: number;
   range: number;
}
