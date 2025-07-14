const { PrivateMessage } = require("bancho.js");
const db = require("../db/connection");
const Matchmaker = require("../matching/matchmaker");

/**
 * @param {PrivateMessage} msg
 * @param {Matchmaker} matchmaker
 */
async function unqueue(msg, matchmaker) {
   matchmaker.unqueue(msg.user);
   msg.user.sendMessage("Removed from queue");
}

/**
 * @param {PrivateMessage} msg
 * @param {Matchmaker} matchmaker
 */
async function queue(msg, matchmaker) {
   console.log("Pvp match request");
   const playersCollection = db.collection("players");
   let player = await playersCollection.findOne({
      osuid: msg.user.id,
      hideLeaderboard: { $exists: false }
   });
   if (!player) {
      // Reister the player
      msg.user.sendMessage("No registration found, creating info.");
      player = await fetch(`${process.env.INTERNAL_URL}/api/db/register`, {
         method: "POST",
         body: JSON.stringify({
            osuid: msg.user.id,
            osuname: msg.user.username
         }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
      }).then(
         res => res.json(),
         err => {
            msg.user.sendMessage(
               `Failed to create registration. Please visit ${process.env.MAPPOOL_URL} to register`
            );
            console.error(err);
         }
      );

      if (!player) return;
   }
   if (!player.osu.pvp) {
      player.osu.pvp = await fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
         method: "PUT",
         body: JSON.stringify({
            id: msg.user.id,
            pp_raw: msg.user.ppRaw,
            mode: "osu"
         }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
      }).then(
         res => res.json(),
         err => {
            msg.user.sendMessage(
               `Failed to create pvp stats. Please visit ${process.env.MAPPOOL_URL}/profile to finish setup`
            );
            console.error(err);
         }
      );

      if (!player.osu.pvp) return;
   }

   matchmaker.searchForMatch({
      bancho: msg.user,
      rating: player.osu.pvp
   });
   msg.user.sendMessage("Searching for pvp match");
}

/**
 * @param {PrivateMessage} msg
 * @param {Matchmaker} matchmaker
 */
function ready(msg, matchmaker) {
   matchmaker.playerReady(msg.user);
}

module.exports = {
   queue,
   unqueue,
   ready
};
