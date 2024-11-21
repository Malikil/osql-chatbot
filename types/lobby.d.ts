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

export enum ModpoolKey {
   NM = 'nm',
   HD = 'hd',
   HR = 'hr',
   DT = 'dt',
   FM = 'fm'
}

export interface Mappool {
   [modpoolKey: string]: MappoolMap[];
}

export interface LobbyState {
   nextPlayer: number;
   action: 'pick' | 'ban';
   scores: number[];
   bans: MappoolMap[];
   picks: MappoolMap[];
}
