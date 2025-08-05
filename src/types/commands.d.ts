import { PrivateMessage } from "bancho.js";
import Matchmaker from "../matching/matchmaker";
import LobbyManager from "../song-rush/lobby-manager";

export type BanchoCommand = (msg: PrivateMessage) => Promise<any>;
export type PvpCommand = (msg: PrivateMessage, matchmaker: Matchmaker) => Promise<void>;
export type PveCommand = (msg: PrivateMessage, lobbyManager: LobbyManager) => Promise<void>;
