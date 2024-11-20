const Matchmaker = require("./matchmaker");
const LobbyRef = require("./lobby-ref");

const matchmaker = new Matchmaker(
   p => {
      console.log("Create match with players", p);
      new LobbyRef(p, p[0].player.bancho.banchojs).startMatch();
   },
   { searchRangeIncrement: 1 / 6 }
);

module.exports = matchmaker;
