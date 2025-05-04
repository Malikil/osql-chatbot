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
   const player = await db.collection("players").findOne({ osuid: msg.user.id });
   if (!player)
      return msg.user.sendMessage(
         `Please register first. Sign in at ${process.env.INTERNAL_URL} and view your profile.`
      );
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
