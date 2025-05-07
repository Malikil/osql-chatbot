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
            osuname: msg.user.username,
            ppRaw: msg.user.ppRaw
         }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
      }).then(
         res => res.json(),
         err => {
            msg.user.sendMessage(
               `Failed to create registration. Please visit ${process.env.INTERNAL_URL} to register`
            );
            console.error(err);
         }
      );

      if (!player) return;
   }
   matchmaker.searchForMatch({
      bancho: msg.user,
      rating: player.pvp
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
