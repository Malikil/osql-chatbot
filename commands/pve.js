const { PrivateMessage } = require("bancho.js");
const db = require("../db/connection");

/**
 * @param {PrivateMessage} msg
 * @param {string[]} args
 */
async function pve(msg, args) {
   console.log("Pve match request");
   return msg.user.sendMessage(
      "Not yet implemented. Generate a songlist on your profile on the website, then report your scores there."
   );

   const player = await db.collection("players").findOne({ osuid: msg.user.id });
   if (!player)
      return msg.user.sendMessage(
         `Please register first. Sign in at ${process.env.INTERNAL_URL} and view your profile.`
      );

   const mapCount = parseInt(args[0] || 7);
   const maps = await fetch(
      `${process.env.INTERNAL_URL}/api/db/pve?p=${msg.user.id}&n=${mapCount}`
   ).then(res => res.json());
   msg.user.sendMessage(`Picked ${maps.length} maps`);

   // Create the lobby
   const bancho = msg.user.banchojs;
   console.log("Create pve lobby");
   const lobbyChannel = await bancho.createLobby(
      `Mappack challenge | ${player.pve.rating.toFixed()} ±${player.pve.rd.toFixed()} | ${Date.now()}`
   );
}

module.exports = pve;
