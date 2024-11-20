const soloMode = require("./pve");

const commands = {
   ping: msg => msg.user.sendMessage("Pong!"),
   pve: soloMode,
   solo: soloMode
};
module.exports = commands;
