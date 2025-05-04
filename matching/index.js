const Matchmaker = require("./matchmaker");

const matchmaker = new Matchmaker(
   {
      searchRangeIncrement: p => {
         p.range + p.player.rating.rd / 100;
      }
   }
);

module.exports = matchmaker;
