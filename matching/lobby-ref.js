const {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoLobbyPlayerScore,
   BanchoMessage,
   BanchoMods,
   BanchoLobbyPlayer
} = require("bancho.js");

const BO = 7;

class LobbyRef {
   #bancho;
   /** @type {BanchoLobby} */
   #lobby;
   /** @type {import("../types/lobby").Mappool} */
   #mappool;
   #players;
   /** @type {import("../types/lobby").LobbyState} */
   #lobbyState;
   #interruptHandler;

   /**
    * @param {import("../types/matchmaking").MMPlayerObj[]} players
    * @param {BanchoClient} bancho
    */
   constructor(players, bancho) {
      console.log("Set up ref instance");
      this.#players = players;
      this.#bancho = bancho;
      const playerParams = this.#players.map(p => p.bancho.id).join("&p=");
      fetch(`${process.env.INTERNAL_URL}/api/db/mappool?p=${playerParams}`)
         .then(data => data.json())
         .then(pool => (this.#mappool = pool))
         .then(() => console.log(this.#mappool));
      this.#lobbyState = {
         nextPlayer: 0,
         action: "ban",
         scores: [0, 0],
         bans: [],
         picks: []
      };
      this.#interruptHandler = function () {
         this.#lobby.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      }.bind(this);
   }

   async startMatch() {
      console.log("Create lobby");
      const lobbyChannel = await this.#bancho.createLobby(
         `MPSQ: ${this.#players[0].bancho.username} vs ${
            this.#players[1].bancho.username
         } - ${Date.now()}`
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
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("terminateLobbies", this.#interruptHandler);
   }

   async #playersJoined() {
      console.log("Start match");
      // Handle lobby commands
      this.#lobby.channel.on("message", this.#handleLobbyCommand.bind(this));
      // Handle reffing stuff
      this.#lobby.on("allPlayersReady", this.#playersReady.bind(this));
      this.#lobby.on("matchFinished", this.#songFinished.bind(this));
      this.#lobby.on("playerLeft", this.#playerLeft.bind(this));
      if (!this.#mappool) {
         this.#lobby.channel.sendMessage("Pool failed to load, attempting refresh");
         const playerParams = this.#players.map(p => p.bancho.id).join("&p=");
         try {
            await fetch(`${process.env.MAPPOOL_URL}/api/db/mappool?p=${playerParams}`)
               .then(data => data.json())
               .then(pool => (this.#mappool = pool))
               .then(() => console.log(this.#mappool));
         } catch (err) {
            this.#lobby.channel.sendMessage("Fetch failed, lobby will close");
            console.warn(err);
            setTimeout(this.closeLobby, 3000);
            return;
         }
      }
      // Send the intro message
      const nmUrl = this.#mappool.nm.map(m => m.id).join(",");
      const hdUrl = this.#mappool.hd.map(m => m.id).join(",");
      const hrUrl = this.#mappool.hr.map(m => m.id).join(",");
      const dtUrl = this.#mappool.dt.map(m => m.id).join(",");
      const fmUrl = this.#mappool.fm.map(m => m.id).join(",");
      const lUrl = encodeURIComponent(this.#lobby.name);
      const searchParams = `nm=${nmUrl}&hd=${hdUrl}&hr=${hrUrl}&dt=${dtUrl}&fm=${fmUrl}&l=${lUrl}`;
      this.#lobby.channel.sendMessage(
         `Mappool can be found here: [${process.env.INTERNAL_URL}/mappool/lobby?${searchParams} Mappool]`
      );
      this.#lobby.channel.sendMessage(
         `First ban: ${this.#players[this.#lobbyState.nextPlayer].bancho.username}`
      );
   }

   /**
    * @param {object} arg0
    * @param {BanchoLobbyPlayer} arg0.player
    */
   async #playerLeft({ player }) {
      // If there are no players left, just close the lobby
      if (this.#lobby.slots.every(p => !p)) return this.closeLobby();

      this.#lobby.channel.sendMessage("!mp timer 150 - Player left lobby");
      this.#lobby.on("timerEnded", () => {
         this.#lobby.channel.sendMessage("Match has been abandoned!");
         fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
            method: "POST",
            body: JSON.stringify({
               mp: this.#lobby.getHistoryUrl(),
               playerDefault: player.user.id
            }),
            headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
         })
            .then(
               () => this.#lobby.channel.sendMessage("Match results submitted to server"),
               err => console.error(err)
            )
            .then(() => setTimeout(this.closeLobby.bind(this), 45000));
      });
      this.#lobby.on("playerJoined", ({ player: joiner }) => {
         if (player.user.id === joiner.user.id) {
            this.#lobby.removeAllListeners("timerEnded");
            this.#lobby.abortTimer();
            this.#lobby.removeAllListeners("playerJoined");
         }
      });
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
               if (this.#lobbyState.action === "ban") this.#banMap(command[1]);
               else if (this.#lobbyState.action === "tbban") this.#tiebreakerBan(command[1]);
               break;
            case "!pick":
            case "!p":
               if (this.#lobbyState.action === "pick" || this.#lobbyState.action === "tb")
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
      const mapNo = parseInt(map[2]) - 1;
      if (
         !(mod in this.#mappool) ||
         isNaN(mapNo) ||
         mapNo < 0 ||
         mapNo >= this.#mappool[mod].length
      )
         return this.#lobby.channel.sendMessage("Unknown map");
      const bannedMap = this.#mappool[mod][mapNo];
      if (this.#lobbyState.bans.includes(bannedMap))
         return this.#lobby.channel.sendMessage("That map is already banned");
      this.#lobbyState.bans.push(bannedMap);
      if (this.#lobbyState.bans.length >= 4) this.#lobbyState.action = "pick";
      this.#lobbyState.nextPlayer = +!this.#lobbyState.nextPlayer;
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
      const mapNo = parseInt(map[2]) - 1;
      if (
         !(mod in this.#mappool) ||
         isNaN(mapNo) ||
         mapNo < 0 ||
         mapNo >= this.#mappool[mod].length
      )
         return this.#lobby.channel.sendMessage("Unknown map");
      const pickedMap = this.#mappool[mod][mapNo];
      if (this.#lobbyState.bans.includes(pickedMap))
         return this.#lobby.channel.sendMessage("That map is banned");
      if (this.#lobbyState.picks.includes(pickedMap))
         return this.#lobby.channel.sendMessage("That map has already been picked");

      await this.#lobby.setMap(pickedMap.id);
      await this.#lobby.setMods(`NF ${mod !== "nm" ? mod.toUpperCase() : ""}`, mod === "fm");
      this.#lobbyState.picks.nextPick = pickedMap;
      this.#lobbyState.picks.selectedModpool = mod;
   }

   /**
    * @param {string} map
    */
   async #tiebreakerBan(map) {
      const mod = map.slice(0, 2).toLowerCase();
      const mapNo = parseInt(map[2]) - 1;
      if (
         !(mod in this.#mappool) ||
         isNaN(mapNo) ||
         mapNo < 0 ||
         mapNo >= this.#mappool[mod].length
      )
         return this.#lobby.channel.sendMessage("Unknown map");
      const bannedMap = this.#mappool[mod][mapNo];
      if (this.#lobbyState.bans.includes(bannedMap))
         return this.#lobby.channel.sendMessage("That map is already banned");
      if (this.#lobbyState.picks.includes(bannedMap))
         return this.#lobby.channel.sendMessage("That map has been picked already");
      this.#lobbyState.bans.push(bannedMap);
      if (this.#lobbyState.bans.length >= 6) {
         this.#lobbyState.action = "tb";
         this.#lobbyState.nextPlayer = +!this.#lobbyState.nextPlayer;
      }
      this.#lobby.channel.sendMessage(
         `Banned map: ${bannedMap.artist} - ${bannedMap.title} [${bannedMap.version}]`
      );
      this.#lobby.channel.sendMessage(
         `Next ${this.#lobbyState.action}: ${
            this.#players[this.#lobbyState.nextPlayer].bancho.username
         }`
      );
   }

   async #playersReady() {
      if (this.#lobbyState.action === "tb") {
         await this.#lobby.updateSettings();
         if (
            this.#lobby.slots.some(player => {
               if (!player) return;
               return !player.mods.includes(BanchoMods.NoFail);
            })
         )
            return this.#lobby.channel.sendMessage("NoFail is required.");
      } else if (this.#lobbyState.picks.selectedModpool === "fm") {
         // Make sure both players have mods enabled
         await this.#lobby.updateSettings();
         if (
            this.#lobby.slots.some(player => {
               if (!player) return;
               return (
                  !player.mods.includes(BanchoMods.NoFail) ||
                  !(
                     player.mods.includes(BanchoMods.Hidden) ||
                     player.mods.includes(BanchoMods.HardRock)
                  )
               );
            })
         )
            return this.#lobby.channel.sendMessage("NoFail is required. HD or HR is required.");
      }
      this.#lobby.startMatch();
   }

   /**
    * @param {BanchoLobbyPlayerScore[]} scores
    */
   #songFinished(scores) {
      console.log(scores);
      // Seems to be sorted in descending order
      const winnerIndex = this.#players.findIndex(p => p.bancho.id === scores[0].player.user.id);
      if (++this.#lobbyState.scores[winnerIndex] > BO / 2) return this.#matchCompleted();
      // Track what maps are played so they can't be picked twice
      this.#lobbyState.picks.push(this.#lobbyState.picks.nextPick);

      // Update the player's states
      this.#lobby.channel.sendMessage(
         `${this.#players[0].bancho.username} ${this.#lobbyState.scores[0]} - ${
            this.#lobbyState.scores[1]
         } ${this.#players[1].bancho.username}`
      );
      if (this.#lobbyState.picks.length < BO - 1) {
         this.#lobbyState.nextPlayer = +!this.#lobbyState.nextPlayer;
         this.#lobby.channel.sendMessage(
            `Next pick: ${this.#players[this.#lobbyState.nextPlayer].bancho.username}`
         );
      } else {
         // Set up tiebreaker
         this.#lobbyState.action = "tbban";
         this.#lobby.channel.sendMessage(
            `Tiebreaker! ${
               this.#players[this.#lobbyState.nextPlayer].bancho.username
            } please ban two maps`
         );
      }
   }

   #matchCompleted() {
      this.#lobby.removeAllListeners();
      this.#lobby.channel.removeAllListeners();
      this.#lobby.channel.sendMessage(
         `${this.#players[0].bancho.username} ${this.#lobbyState.scores[0]} - ${
            this.#lobbyState.scores[1]
         } ${this.#players[1].bancho.username}`
      );
      this.#lobby.channel.sendMessage(
         `GGWP! ${
            this.#lobbyState.scores[0] > this.#lobbyState.scores[1]
               ? this.#players[0].bancho.username
               : this.#players[1].bancho.username
         } won the match.`
      );
      fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
         method: "POST",
         body: JSON.stringify({ mp: this.#lobby.getHistoryUrl() }),
         headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH]]
      })
         .then(
            () => this.#lobby.channel.sendMessage("Match results submitted to server"),
            err => console.error(err)
         )
         .then(() => setTimeout(this.closeLobby.bind(this), 45000));
   }

   async closeLobby() {
      process.off("terminateLobbies", this.#interruptHandler);
      this.#lobby.removeAllListeners();
      this.#lobby.channel.removeAllListeners();
      await this.#lobby
         .closeLobby()
         .catch(err => console.warn(err))
         .then(() => (this.#lobby = null));
      this.#bancho = null;
      this.#mappool = null;
      this.#players = null;
   }
}

module.exports = LobbyRef;
