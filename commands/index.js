const soloMode = require("./pve");
const pvp = require("./pvp");

const commands = {
   ping: msg => msg.user.sendMessage("Pong!"),
   pvp: pvp,
   queue: pvp,
   q: pvp,
   pve: soloMode,
   solo: soloMode
};
module.exports = commands;
