import { GameMode, SimpleMod, Rating, ModMultipliers } from "./global";

export interface DbBeatmap {
   // BeatmapVersion
   _id: number;
   setid: number;
   version: string;
   length: number;
   bpm: number;
   cs?: number;
   ar?: number;
   od?: number;
   stars: number;
   convert?: boolean;
   // DbBeatmap
   artist: string;
   title: string;
   mapper: string;
   maxCombo: number;
   noteCount: {
      circles: number;
      sliders: number;
   };
   lastUpdate?: Date;
   lastQuery?: Date;
   matchmakingUntil?: Date;
   styles: number[];
   mods: ModMultipliers;
   rating: Rating;
}
