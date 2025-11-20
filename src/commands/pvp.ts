import { playersDb } from "../db/connection";
import { GameMode } from "../types/global";
import { DbPlayer, PvPInfo } from "../types/database.player";
import { PvpCommand } from "../types/commands";

export const unqueue: PvpCommand = async (msg, matchmaker) => {
   matchmaker.unqueue(msg.user);
   msg.user.sendMessage("Removed from queue");
};

export const queue: PvpCommand = async (msg, matchmaker) => {
   console.log("Pvp match request");
   let player: DbPlayer | null = await playersDb.findOne({
      _id: msg.user.id,
      hideLeaderboard: { $exists: false }
   });
   if (!player) {
      // Reister the player
      msg.user.sendMessage("No registration found, creating info.");
      player = (await fetch(`${process.env.INTERNAL_URL}/api/db/register`, {
         method: "POST",
         body: JSON.stringify({
            osuid: msg.user.id,
            osuname: msg.user.username
         }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
      }).then(
         res => res.json(),
         err => {
            msg.user.sendMessage(
               `Failed to create registration. Please visit ${process.env.MAPPOOL_URL} to register`
            );
            console.error(err);
         }
      )) as DbPlayer | null;

      if (!player) return;
   }
   // Figure out the gamemode
   let mode = msg.message.split(" ")[1] as GameMode | "ctb" | "4k" | "7k";
   let variant: "4k" | "7k" | undefined = undefined;
   if (mode === "ctb") mode = "fruits";
   if (mode === "4k" || mode === "7k") {
      variant = mode;
      mode = "mania";
   }
   if (!["osu", "fruits", "taiko", "mania"].includes(mode)) mode = "osu";
   if (!player[mode].pvp) {
      player[mode].pvp = (await fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
         method: "PUT",
         body: JSON.stringify({
            id: msg.user.id,
            pp_raw: msg.user.ppRaw,
            mode
         }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
      }).then(
         res => res.json(),
         err => {
            msg.user.sendMessage(
               `Failed to create pvp stats. Please visit ${process.env.MAPPOOL_URL}/profile to finish setup`
            );
            console.error(err);
         }
      )) as PvPInfo;

      if (!player[mode].pvp) return;
   }

   matchmaker.searchForMatch({
      bancho: msg.user,
      rating: player[mode].pvp as PvPInfo,
      mode,
      variant
   });
   msg.user.sendMessage(`Searching for pvp match in '${mode}'`);
};

export const ready: PvpCommand = async (msg, matchmaker) => {
   matchmaker.playerReady(msg.user);
};

export default {
   queue,
   unqueue,
   ready
};
