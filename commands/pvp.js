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
   matchmaker.searchForMatch({
      player: {
         bancho: msg.user,
         rating: player.pvp
      },
      rating: player.pvp.rating,
      range: player.pvp.rd
   });
   msg.user.sendMessage("Searching for pvp match");
}

module.exports = {
   queue,
   unqueue
};
