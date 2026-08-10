import { GameMode, ModMultipliers, ModPool, Rating, SimpleMod } from "./global";

export interface MatchHistoryMap {
   id: number;
   setid: number;
   version: string;
}

export interface MatchHistorySong {
   map: MatchHistoryMap;
   mods: number;
   score: number;
   opponentScore?: number;
}

export interface MatchHistory {
   mp: number;
   prevRating: number;
   ratingDiff: number;
   songs: MatchHistorySong[];
}
export interface MatchHistoryOpponent {
   id?: number;
   name: string;
   rating: number;
}
export interface PvPMatchHistory extends MatchHistory {
   opponent: MatchHistoryOpponent;
   warmups?: number;
}

export interface PvPInfo extends Rating {
   matches: PvPMatchHistory[];
   losses: number;
   wins: number;
   lastPlayed?: Date;
}

export interface PvEInfo extends Rating {
   matches: MatchHistory[];
   games: number;
   songs: number;
   lastPlayed?: Date;
}

export interface ModeInfo {
   pvp?: PvPInfo;
   pve: PvEInfo;
   styles: number[];
   mods: Partial<Record<Mod, number>>;
}

export interface DbPlayer extends Record<GameMode, ModeInfo> {
   _id: number;
   osuname: string;
   admin?: boolean;
   hideLeaderboard?: boolean;
   gamemode?: GameMode;
}
