const { BanchoUser, BanchoClient } = require("bancho.js");
const LobbyRef = require("./lobby-ref");

class LobbyManager {
   /** @type {LobbyRef[]} */
   #activeLobbies;
   /** @type {BanchoClient} */
   #bancho;

   /**
    * @param {BanchoClient} bancho
    */
   constructor(bancho) {
      this.init(bancho);
   }

   init(bancho) {
      this.#activeLobbies = [];
      this.#bancho = bancho;
   }

   createLobby(players) {
      console.log("Create match with players", p);
      const lobby = new LobbyRef(players, this.#bancho);
      lobby.startMatch();
      this.#activeLobbies.push(lobby);
      const finished = () => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         this.#activeLobbies.splice(i, 1);
         lobby.off("finished", finished);
      };
      lobby.on("finished", finished);
   }

   /**
    * @param {BanchoUser} player
    */
   reinvite(player) {
      const lobby = this.#activeLobbies.find(l => l.hasPlayer(player));
      lobby.invite(player);
   }
}

module.exports = LobbyManager;