import { PveCommand } from "../types/commands";
import { GameMode } from "../types/global";

export const songRushLobby: PveCommand = async (msg, lobbyManager) => {
   // Figure out the gamemode
   let mode = msg.message.split(" ")[1] as GameMode | "ctb";
   if (mode === "ctb") mode = "fruits";
   let maniamode = null;
   if (["4k", "7k"].includes(mode)) {
      maniamode = mode as "4k" | "7k";
      mode = "mania";
   }
   if (!["osu", "fruits", "taiko", "mania"].includes(mode)) mode = "osu";
   lobbyManager.createLobby(msg.user, mode, maniamode);
};
