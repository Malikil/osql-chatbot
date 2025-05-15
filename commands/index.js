const { BanchoMessage } = require("bancho.js");
const Matchmaker = require("../matching/matchmaker");
const pvp = require("./pvp");
const LobbyManager = require("../matching/lobby-manager");

/**
 * @param {Matchmaker} matchmaker
 * @param {LobbyManager} lobbyManager
 * @returns {{ [key: string]: function(BanchoMessage)}}
 */
function init(matchmaker, lobbyManager) {
   const commands = [
      ["pvp", pvp.queue],
      ["queue", pvp.queue],
      ["q", pvp.queue],
      ["unq", pvp.unqueue],
      ["unqueue", pvp.unqueue],
      ["ready", pvp.ready],
      ["r", pvp.ready],
      ["invite", msg => lobbyManager.reinvite(msg.user)],
      ["reinvite", msg => lobbyManager.reinvite(msg.user)],
      ["lobby", msg => lobbyManager.reinvite(msg.user)]
   ].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

   return {
      commands: msg => msg.user.sendMessage(commands.map(com => com[0]).join(", ")),
      help: msg => msg.user.sendMessage(commands.map(com => com[0]).join(", ")),
      ...Object.fromEntries(commands.map(com => [com[0], msg => com[1](msg, matchmaker)]))
   };
}

module.exports = { init };
