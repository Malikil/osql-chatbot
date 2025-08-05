import { PrivateMessage } from "bancho.js";

export type BanchoCommand = (msg: PrivateMessage) => Promise<any>;
export type PvpCommand = (msg: PrivateMessage, matchmaker: Matchmaker) => Promise<void>;
