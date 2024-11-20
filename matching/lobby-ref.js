const {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoLobbyPlayerScore,
   BanchoMessage
} = require("bancho.js");

class LobbyRef {
   #bancho;
   /** @type {BanchoLobby} */
   #lobby;
   /** @type {import("../types/lobby").Mappool} */
   #mappool;
   #players;

   /**
    * @param {import("../types/matchmaking").Player[]} players
    * @param {BanchoClient} bancho
    */
   constructor(players, bancho) {
      this.#players = players.map(p => p.player);
      this.#bancho = bancho;
      const playerParams = this.#players.map(p => p.bancho.id).join("&p=");
      fetch(`${process.env.INTERNAL_URL}/api/db/mappool?p=${playerParams}`)
         .then(data => data.json())
         .then(pool => (this.#mappool = pool));
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
      // Set up lobby listeners
      const playerJoinListener = ({ player }) => {
         console.log(`${player.user.username} joined the lobby`);
         if (this.#lobby.slots.filter(p => p).length > 1) {
            // Stop waiting for players to join
            this.#lobby.off("playerJoined", playerJoinListener);
            this.#playersJoined();
         }
      };
      this.#lobby.on("playerJoined", playerJoinListener);
      // Invite players
      this.#players.forEach(p => this.#lobby.invitePlayer(`#${p.bancho.id}`));
   }

   async #playersJoined() {
      console.log("Start match");
      // Handle lobby commands
      this.#lobby.channel.on("message", this.#handleLobbyCommand.bind(this));
      // Handle reffing stuff
      this.#lobby.on("allPlayersReady", () => this.#lobby.startMatch());
      this.#lobby.on("matchFinished", this.#matchFinished.bind(this));
      // Send the intro message
      const poolUrl = this.#players.map(p => p.bancho.id).join("/");
      this.#lobby.channel.sendMessage(
         `Mappool can be found [${process.env.INTERNAL_URL}/mappool/${poolUrl} here]`
      );
   }

   /**
    * @param {BanchoMessage} msg
    */
   #handleLobbyCommand(msg) {
      if (msg.message.startsWith("!")) {
         const command = msg.message.split(" ");
         console.log(command);
      }
   }

   /**
    * @param {BanchoLobbyPlayerScore[]} scores
    */
   #matchFinished(scores) {
      console.log(scores);
      // Seems to be sorted in descending order
   }

   async closeLobby() {
      this.#bancho = null;
      this.#mappool = null;
      this.#players = null;
      await this.#lobby
         .closeLobby()
         .then(() => this.#lobby.removeAllListeners())
         .catch(err => console.warn(err))
         .then(() => (this.#lobby = null));
   }
}

module.exports = LobbyRef;
