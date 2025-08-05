import {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoMessage,
   BanchoMods,
   BanchoLobbyPlayer,
   BanchoUser
} from "bancho.js";
import EventEmitter from "node:events";
import { LobbyEvents } from "../types/lobby";
import { GameMode } from "../types/global";

class LobbyRef extends EventEmitter<LobbyEvents> {
   #bancho;
   #lobby?: BanchoLobby;
   #mode;
   #interruptHandler;

   constructor(bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#interruptHandler = (() => {
         this.#lobby?.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      }).bind(this);
   }

   async startMatch() {
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("SIGTERM", this.#interruptHandler);
   }

   async #playersJoined() {}

   async #playerLeft(player: BanchoLobbyPlayer) {}

   #handleLobbyCommand(msg: BanchoMessage) {}

   async #playersReady() {}

   /**
    * @param {BanchoLobbyPlayerScore[]} scores
    */
   #songFinished() {}

   #matchCompleted() {
      console.log("Match complete");
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
         .then(() => setTimeout(this.closeLobby.bind(this), 30000));
      this.emit("finished", this.#lobby.getHistoryUrl(), this.#lobbyState);
   }

   async closeLobby() {
      process.off("SIGTERM", this.#interruptHandler);
      try {
         this.#lobby.removeAllListeners();
         this.#lobby.channel.removeAllListeners();
         await this.#lobby
            .closeLobby()
            .catch(err => console.warn(err))
            .then(() => (this.#lobby = null));
      } catch (err) {
         console.warn("Couldn't clean up properly");
         console.warn(err);
      } finally {
         this.#bancho = null;
         this.#mappool = null;
         this.#players = null;
         this.emit("closed");
      }
   }

   /**
    * @param {BanchoUser} player
    */
   hasPlayer(player: BanchoUser) {
      return !!this.#players.find(p => p.bancho.id === player.id);
   }

   /**
    * @param {BanchoUser} player
    */
   invite(player: BanchoUser) {
      this.#lobby.invitePlayer(`#${player.id}`);
   }
}

export default LobbyRef;
