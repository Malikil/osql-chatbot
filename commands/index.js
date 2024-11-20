const soloMode = require("./pve");
const pvp = require("./pvp");

const commands = {
   ping: msg => msg.user.sendMessage("Pong!"),
   pvp: pvp.queue,
   queue: pvp.queue,
   q: pvp.queue,
   unq: pvp.unqueue,
   unqueue: pvp.unqueue,
   pve: soloMode,
   solo: soloMode
};
module.exports = commands;
