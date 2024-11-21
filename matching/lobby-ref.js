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
   /** @type {import("../types/lobby").LobbyState} */
   #lobbyState;

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
      this.#lobbyState = {
         nextPlayer: 0,
         action: "ban",
         scores: [0, 0],
         bans: [],
         picks: []
      };
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
      this.#lobby.on("playerJoined", ({ player }) => {
         console.log(`${player.user.username} joined the lobby`);
         if (this.#lobby.slots.filter(p => p).length > 1) {
            // Stop waiting for players to join
            this.#lobby.removeAllListeners("playerJoined");
            this.#playersJoined();
         }
      });
      // Invite players
      this.#players.forEach(p => this.#lobby.invitePlayer(`#${p.bancho.id}`));
   }

   async #playersJoined() {
      console.log("Start match");
      // Handle lobby commands
      this.#lobby.channel.on("message", this.#handleLobbyCommand.bind(this));
      // Handle reffing stuff
      this.#lobby.on("allPlayersReady", () => this.#lobby.startMatch());
      this.#lobby.on("matchFinished", this.#songFinished.bind(this));
      // Send the intro message
      const poolUrl = this.#players.map(p => p.bancho.id).join("/");
      this.#lobby.channel.sendMessage(
         `Mappool can be found [${process.env.INTERNAL_URL}/mappool/${poolUrl} here]`
      );
      this.#lobby.channel.sendMessage(
         `First ban: ${this.#players[this.#lobbyState.nextPlayer].bancho.username}`
      );
   }

   /**
    * @param {BanchoMessage} msg
    */
   #handleLobbyCommand(msg) {
      if (
         msg.message.startsWith("!") &&
         msg.user.id === this.#players[this.#lobbyState.nextPlayer].bancho.id
      ) {
         const command = msg.message.split(" ");
         if (command.length < 2) return;
         console.log(command);
         switch (command[0]) {
            case "!ban":
            case "!b":
               if (this.#lobbyState.action !== "ban") break;
               this.#banMap(command[1]);
               break;
            case "!pick":
            case "!p":
               if (this.#lobbyState.action !== "pick") break;
               this.#pickMap(command[1]);
               break;
         }
      }
   }

   /**
    * @param {string} map
    */
   #banMap(map) {
      const mod = map.slice(0, 2).toLowerCase();
      const mapNo = parseInt(map[2]);
      const bannedMap = this.#mappool[mod][mapNo];
      if (this.#lobbyState.bans.includes(bannedMap))
         return this.#lobby.channel.sendMessage("That map is already banned");
      this.#lobbyState.bans.push(bannedMap);
      if (this.#lobbyState.bans.length > 1) this.#lobbyState.action = "pick";
      this.#lobbyState.nextPlayer = +!!this.#lobbyState.nextPlayer;
      this.#lobby.channel.sendMessage(
         `Banned map: ${bannedMap.artist} - ${bannedMap.title} [${bannedMap.version}]`
      );
      this.#lobby.channel.sendMessage(
         `Next ${this.#lobbyState.action}: ${
            this.#players[this.#lobbyState.nextPlayer].bancho.username
         }`
      );
   }

   /**
    * @param {string} map
    */
   async #pickMap(map) {
      const mod = map.slice(0, 2).toLowerCase();
      const mapNo = parseInt(map[2]);
      const pickedMap = this.#mappool[mod][mapNo];
      if (this.#lobbyState.bans.includes(pickedMap))
         return this.#lobby.channel.sendMessage("That map is banned");
      if (this.#lobbyState.picks.includes(pickedMap))
         return this.#lobby.channel.sendMessage("That map has already been picked");

      await this.#lobby.setMap(pickedMap.id);
      await this.#lobby.setMods(`NF ${mod !== "nm" ? mod.toUpperCase() : ""}`, mod === "fm");
   }

   /**
    * @param {BanchoLobbyPlayerScore[]} scores
    */
   #songFinished(scores) {
      console.log(scores);
      // Seems to be sorted in descending order
      const winnerIndex = this.#players.findIndex(p => p.bancho.id === scores[0].player.user.id);
      if (++this.#lobbyState.scores[winnerIndex] >= 4) return this.#matchCompleted();

      // Update the player's states
      this.#lobbyState.nextPlayer = +!!this.#lobbyState.nextPlayer;
      this.#lobby.channel.sendMessage(
         `${this.#players[0].bancho.username} ${this.#lobbyState.scores[0]} - ${
            this.#lobbyState.scores[1]
         } ${this.#players[1].bancho.username}`
      );
      this.#lobby.channel.sendMessage(
         `Next pick: ${this.#players[this.#lobbyState.nextPlayer].bancho.username}`
      );
   }

   #matchCompleted() {
      this.#lobby.removeAllListeners();
      this.#lobby.channel.sendMessage(
         `${this.#players[0].bancho.username} ${this.#lobbyState.scores[0]} - ${
            this.#lobbyState.scores[1]
         } ${this.#players[1].bancho.username}`
      );
      fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
         method: "POST",
         body: { mp: this.#lobby.getHistoryUrl() },
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
      })
         .then(
            () => this.#lobby.channel.sendMessage("Match results submitted to server"),
            err => console.error(err)
         )
         .then(() => setTimeout(this.closeLobby.bind(this), 10000));
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
