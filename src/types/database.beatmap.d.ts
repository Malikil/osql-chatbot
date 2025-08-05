import { GameMode, SimpleMod, Rating } from "./global";

export interface DbBeatmap {
   // BeatmapVersion
   id: number;
   setid: number;
   version: string;
   length: number;
   bpm: number;
   cs: number;
   ar: number;
   od: number;
   stars: number;
   ratings: Record<SimpleMod, Rating>;
   // DbBeatmap
   artist: string;
   title: string;
   mapper: string;
   mode: GameMode;
   maxCombo: number;
   noteCount: {
      circles: number;
      sliders: number;
   };
   lastUpdate?: Date;
   lastQuery?: Date;
   matchmakingUntil?: Date;
}
