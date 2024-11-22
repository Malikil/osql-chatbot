const soloMode = require("./pve");
const pvp = require("./pvp");

const commands = {
   ping: msg => msg.user.sendMessage("Pong!"),
   commands: msg => msg.user.sendMessage(Object.keys(commands).join(", ")),
   pvp: pvp.queue,
   queue: pvp.queue,
   q: pvp.queue,
   unq: pvp.unqueue,
   unqueue: pvp.unqueue,
   ready: pvp.ready,
   pve: soloMode,
   solo: soloMode
};
module.exports = commands;
