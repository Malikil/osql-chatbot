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
   picks: number[] & { nextPick: number; selectedModpool: ModPool };
}

export interface LobbyEvents {
   finished: [mp: string, state: LobbyState];
   closed: [];
}

export interface Lobby {}
