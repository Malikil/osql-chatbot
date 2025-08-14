import { PveCommand } from "../types/commands";
import { GameMode } from "../types/global";

export const songRushLobby: PveCommand = async (msg, lobbyManager) => {
   // Figure out the gamemode
   let mode = msg.message.split(" ")[1] as GameMode | "ctb";
   if (mode === "ctb") mode = "fruits";
   if (!["osu", "fruits", "taiko"].includes(mode)) mode = "osu";
   lobbyManager.createLobby(msg.user, mode);
};
