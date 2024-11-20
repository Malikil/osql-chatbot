const {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions
} = require("bancho.js");

class LobbyRef {
   #players;
   #bancho;
   /** @type {BanchoLobby} */
   #lobby;

   /**
    * @param {import("../types/matchmaking").Player[]} players
    * @param {BanchoClient} bancho
    */
   constructor(players, bancho) {
      this.#players = players.map(p => p.player);
      this.#bancho = bancho;
   }

   async startMatch() {
      console.log("Create lobby");
      const lobbyChannel = await this.#bancho.createLobby(
         `PackChal: ${this.#players[0].bancho.username} vs ${
            this.#players[1].bancho.username
         } - ${Math.random()}`,
         true
      );
      this.#lobby = lobbyChannel.lobby;
      console.log(`Created lobby: ${lobbyChannel.name}`);
      await this.#lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         2
      );
   }

   async #playersJoined() {
      console.log("Start match");
   }
}

module.exports = LobbyRef;
