export type SimpleMod = "nm" | "hd" | "hr" | "dt";
export type ModPool = SimpleMod | "fm";
export type GameMode = "osu" | "fruits" | "taiko" | "mania";
export type ModMultipliers = { [mod: string]: number };

export interface Rating {
   rating: number;
   rd: number;
   vol: number;
}
