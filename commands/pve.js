const { PrivateMessage } = require("bancho.js");

/**
 * @param {PrivateMessage} msg
 */
function pve(msg) {
   console.log("Solo mode");
   msg.user.sendMessage(
      "Not yet implemented. Generate a songlist on your profile on the website, then report your scores there."
   );
}

module.exports = pve;
