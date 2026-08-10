import { ModMultipliers, ModPool, Rating } from "./global";

export type Mappool = {
   nm: number[];
   hd: number[];
   hr: number[];
   dt: number[];
   fm: number[];
};

export interface LobbyState {
   nextPlayer: number;
   action: "pick" | "ban" | "tbban" | "tb";
   scores: number[];
   bans: number[];
   picks: number[];
   activePick: { map: number; modpool: ModPool };
}

export interface LobbyResult {
   mp: number;
   score?: { playerId: number; score: number }[];
   defaultWinner?: number;
}

export interface LobbyEvents {
   finished: [mp: string, state: LobbyState];
   closed: [];
}

export interface Lobby {}
