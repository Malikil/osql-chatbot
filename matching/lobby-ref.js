const { BanchoClient } = require("bancho.js");

class LobbyRef {
   #players;
   #bancho;

   /**
    * @param {import("../types/matchmaking").Player[]} players
    * @param {BanchoClient} bancho
    */
   constructor(players, bancho) {
      this.#players = players;
      this.#bancho = bancho;
   }

   startMatch() {
      console.log("Create lobby");
   }
}

module.exports = LobbyRef;
