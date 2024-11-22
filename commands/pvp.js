const { PrivateMessage } = require("bancho.js");
const matchmaker = require("../matching");
const db = require("../db/connection");

/**
 * @param {PrivateMessage} msg
 */
async function unqueue(msg) {
   matchmaker.unqueue(msg.user);
   msg.user.sendMessage("Removed from queue");
}

/**
 * @param {PrivateMessage} msg
 */
async function queue(msg) {
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
 */
function ready(msg) {
   matchmaker.playerReady(msg.user);
}

module.exports = {
   queue,
   unqueue,
   ready
};
