import { QualifierCommand } from "../types/commands";
import { GameMode, ModPool } from "../types/global";

export const qualifierLobby: QualifierCommand = async (msg, lobbyManager) => {
   const messageArgs = msg.message.split(" ");
   // Skip the !qual command
   messageArgs.shift();
   // Figure out the gamemode
   let mode = messageArgs.shift() as GameMode | "ctb";
   if (mode === "ctb") mode = "fruits";
   if (["4k", "7k"].includes(mode)) {
      mode = "mania";
   }
   if (!["osu", "fruits", "taiko", "mania"].includes(mode)) mode = "osu";
   // Figure out the maplist
   const maplist: {
      map: number;
      mod: ModPool;
   }[] = [];
   let nextArg: string;
   let mod: ModPool = "nm";
   let shuffle = false;
   do {
      nextArg = messageArgs.shift() || "";
      const id = parseInt(nextArg);
      if (id)
         maplist.push({
            map: id,
            mod
         });
      else if (["nm", "hd", "hr", "dt", "fm"].includes(nextArg)) mod = nextArg as ModPool;
      else if (nextArg === 'shuffle') shuffle = true;
   } while (nextArg);
   lobbyManager.createLobby(msg.user, mode, maplist, shuffle);
};
