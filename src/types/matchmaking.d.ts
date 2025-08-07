import { BanchoUser } from "bancho.js";
import { GameMode, Rating } from "./global";

export interface MMPlayerObj {
   bancho: BanchoUser;
   rating: Rating;
   mode: GameMode;
}

export interface QueuedPlayer {
   player: MMPlayerObj;
   rating: number;
   range: number;
   mode: GameMode;
}

export interface PendingLobby {
   players: {
      player: MMPlayerObj;
      ready: boolean;
   }[];
   waitTimer: NodeJS.Timeout;
   mode: GameMode;
}

export interface MatchmakerEvents {
   match: [players: MMPlayerObj[], mode: GameMode];
}
