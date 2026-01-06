import { PrivateMessage } from "bancho.js";
import Matchmaker from "../matching/matchmaker";

export type BanchoCommand = (msg: PrivateMessage) => Promise<any>;
export type PvpCommand = (msg: PrivateMessage, matchmaker: Matchmaker) => Promise<void>;
