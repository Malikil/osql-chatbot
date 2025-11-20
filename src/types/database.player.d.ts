import { GameMode, ModPool, Rating, SimpleMod } from "./global";

export interface MatchHistoryMap {
   id: number;
   setid: number;
   version: string;
}

export interface MatchHistorySong {
   map: MatchHistoryMap;
   mod: string;
   score: number;
}
export interface PvEMatchHistorySong extends MatchHistorySong {
   mod: SimpleMod;
}
export interface PvPMatchHistorySong extends MatchHistorySong {
   mod: ModPool;
   opponentScore: number;
}

export interface MatchHistory {
   mp: number;
   prevRating: number;
   ratingDiff: number;
   songs: MatchHistorySong[];
}
export interface MatchHistoryOpponent {
   id: number;
   name: string;
   rating: number;
}
export interface PvEMatchHistory extends MatchHistory {
   songs: PvEMatchHistorySong[];
}
export interface PvPMatchHistory extends MatchHistory {
   songs: PvPMatchHistorySong[];
   opponent: MatchHistoryOpponent;
}

export interface PvPInfo extends Rating {
   matches: PvPMatchHistory[];
   losses: number;
   wins: number;
}

export interface PvEInfo extends Rating {
   matches: PvEMatchHistory[];
   games: number;
   songs: number;
}

export interface ModeInfo {
   pvp?: PvPInfo;
   pve: PvEInfo;
}

export interface DbPlayer extends Record<GameMode, ModeInfo> {
   _id: number;
   osuname: string;
   admin?: boolean;
   hideLeaderboard?: boolean;
   gamemode?: GameMode;
}
