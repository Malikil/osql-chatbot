import { Rating } from "./global";

export interface RatingSet {
   nm: Rating;
   hd: Rating;
   hr: Rating;
   dt: Rating;
}

export interface MappoolMap {
   id: number;
   setid: number;
   artist: string;
   title: string;
   version: string;
   length: number;
   bpm: number;
   cs: number;
   ar: number;
   stars: number;
   ratings: RatingSet
}

export interface Mappool {
   nm: MappoolMap[];
   hd: MappoolMap[];
   hr: MappoolMap[];
   dt: MappoolMap[];
   fm: MappoolMap[];
}

export interface LobbyState {
   nextPlayer: number;
   action: "pick" | "ban" | "tbban" | "tb";
   scores: number[];
   bans: MappoolMap[];
   picks: MappoolMap[];
}

export interface LobbyEvents {
   finished: [mp: string, state: LobbyState];
   closed: [];
}
