const Matchmaker = require("./matchmaker");
const LobbyRef = require("./lobby-ref");

const matchmaker = new Matchmaker(
   p => {
      console.log("Create match with players", p);
      new LobbyRef(p, p[0].bancho.banchojs).startMatch();
   },
   {
      searchRangeIncrement: p => {
         p.range + p.player.rating.rd / 100;
      }
   }
);

module.exports = matchmaker;
