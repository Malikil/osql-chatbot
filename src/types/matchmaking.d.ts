import { BanchoUser } from "bancho.js";
import { GameMode, Rating } from "./global";

export interface MMPlayerObj {
   bancho: BanchoUser;
   rating: Rating;
   mode: GameMode;
   variant?: "4k" | "7k";
}

export interface QueuedPlayer {
   player: MMPlayerObj;
   rating: number;
   range: number;
   mode: GameMode;
   variant?: "4k" | "7k";
}

export interface PendingLobby {
   players: {
      player: MMPlayerObj;
      ready: boolean;
   }[];
   waitTimer: NodeJS.Timeout;
   mode: GameMode;
   variant?: "4k" | "7k";
}

export interface MatchmakerEvents {
   match: [players: MMPlayerObj[], mode: GameMode, variant?: "4k" | "7k"];
}
