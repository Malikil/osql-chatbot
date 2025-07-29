export type SimpleMod = 'nm' | 'hd' | 'hr' | 'dt';
export type ModPool = SimpleMod | 'fm';
export type GameMode = 'osu' | 'fruits' | 'taiko' | 'mania';

export interface Rating {
   rating: number;
   rd: number;
   vol: number;
}
