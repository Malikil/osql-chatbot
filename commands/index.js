const { BanchoMessage } = require("bancho.js");
const Matchmaker = require("../matching/matchmaker");
const pvp = require("./pvp");

/**
 * @param {Matchmaker} matchmaker 
 * @returns {{ [key: string]: function(BanchoMessage)}}
 */
function init(matchmaker) {
   const commands = [
      ['pvp', pvp.queue],
      ['queue', pvp.queue],
      ['q', pvp.queue],
      ['unq', pvp.unqueue],
      ['unqueue', pvp.unqueue],
      ['ready', pvp.ready],
      ['r', pvp.ready]
   ];

   return {
      commands: msg => msg.user.sendMessage(commands.map(com => com[0]).join(', ')),
      help: msg => msg.user.sendMessage(commands.map(com => com[0]).join(', ')),
      ...Object.fromEntries(commands.map(com => [com[0], msg => com[1](msg, matchmaker)]))
   }
}

module.exports = { init };
