import { BanchoUser } from "bancho.js";
import { Rating } from "./global";

export interface MMPlayerObj {
   bancho: BanchoUser;
   rating: Rating
}

export interface QueuedPlayer {
   player: MMPlayerObj;
   rating: number;
   range: number;
}

export interface PendingLobby {
   players: {
      player: MMPlayerObj;
      ready: boolean;
   }[];
   waitTimer: NodeJS.Timeout;
}

export interface MatchmakerEvents {
   match: [players: MMPlayerObj[]];
}
