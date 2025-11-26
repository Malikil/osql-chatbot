import { BanchoMod, BanchoMods } from "bancho.js";
import { QualifierCommand } from "../types/commands";
import { GameMode } from "../types/global";

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
      mods: BanchoMod[];
      freemod?: boolean;
   }[] = [];
   let nextArg: string;
   let mods: BanchoMod[] = [];
   let freemod = false;
   let shuffle = false;
   do {
      nextArg = messageArgs.shift() || "";
      const id = parseInt(nextArg);
      if (id)
         maplist.push({
            map: id,
            mods,
            freemod
         });
      else if (nextArg === "shuffle") shuffle = true;
      else {
         mods = BanchoMods.parseShortMods(nextArg);
         freemod = nextArg.toLowerCase().includes("fm");
      }
   } while (nextArg);
   lobbyManager.createLobby(msg.user, mode, maplist, shuffle);
};
