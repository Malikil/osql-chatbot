import {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoMessage,
   BanchoLobbyPlayer,
   BanchoUser,
   BanchoLobbyPlayerScore
} from "bancho.js";
import { Mode } from 'nodesu'
import EventEmitter from "node:events";
import { LobbyEvents } from "../types/lobby";
import { GameMode, SimpleMod } from "../types/global";
import { mapsDb } from "../db/connection";

class LobbyRef extends EventEmitter<LobbyEvents> {
   #bancho;
   #lobby?: BanchoLobby;
   #mode;
   #player;
   #interruptHandler;
   #completedRating;
   #nextRating;
   #currentHealth;

   constructor(player: BanchoUser, bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#player = player;
      this.#completedRating = 0;
      this.#nextRating = 0;
      this.#currentHealth = 50;
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
      // Create the lobby
      const mpChannel = await this.#bancho.createLobby(
         `Score Rush ${this.#player.username} - ${Date.now()}`
      );
      this.#lobby = mpChannel.lobby;
      mpChannel.on("message", this.#handleLobbyCommand.bind(this));

      console.log(`Created lobby: ${mpChannel.name}`);
      await this.#lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2
      );
      // Set up lobby listeners
      const playerJoined = ({ player }: { player: BanchoLobbyPlayer }) => {
         console.log(`${player.user.username} joined the lobby`);
         const pcount = this.#lobby?.slots.filter(p => p).length;
         if (pcount && pcount > 1) {
            // Stop waiting for players to join
            this.#lobby?.off("playerJoined", playerJoined);
            this.#playersJoined();
         }
      };
      this.#lobby.on("playerJoined", playerJoined);
      // Set up events for match gameplay
      this.#lobby.on('allPlayersReady', this.#playersReady.bind(this));
      this.#lobby.on('playerLeft', this.#playerLeft.bind(this));
      this.#lobby.on('matchFinished', this.#songFinished.bind(this) as () => void);
      // Invite player
      this.#lobby.invitePlayer(`#${this.#player.id}`);
   }

   async #playersJoined() {
      console.log(`${this.#lobby?.id} - All players joined`);
      // Get initial rating value
      const minValues = await mapsDb
         .aggregate<{ minNm: number; minHd: number; minHr: number; minDt: number }>([
            { $match: { mode: this.#mode } },
            {
               $group: {
                  _id: null,
                  minNm: { $min: "$ratings.nm.rating" },
                  minHd: { $min: "$ratings.hd.rating" },
                  minHr: { $min: "$ratings.hr.rating" },
                  minDt: { $min: "$ratings.dt.rating" }
               }
            }
         ])
         .next();
      if (!minValues) throw new Error("No minimum values returned from database");
      this.#completedRating = Math.min(
         minValues.minNm,
         minValues.minHd,
         minValues.minHr,
         minValues.minDt
      ) - 1;
      // Get the map
      this.#nextSong();
   }

   async #playerLeft(player: BanchoLobbyPlayer) {}

   #handleLobbyCommand(msg: BanchoMessage) {}

   async #playersReady() {
      this.#lobby?.startMatch(5);
   }

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      console.log(scores);
      this.#completedRating = this.#nextRating;
      const playerScore = scores.find(s => s.player.user.id === this.#player.id);
      const oldHealth = this.#currentHealth;
      // Calculate the new health value
      const pass = !!playerScore?.pass;
      // Curve through (0,0) (750k, 5) (1m, 10)
      const hpMod = 3.49522 * Math.pow(playerScore?.score || 0, 2.40942) / 100_000_000_000_000; // Magic numbers! 10^14
      this.#currentHealth = Math.min(hpMod - 5 - (+pass) * 10, 99) | 0;
      // Message new health value
      const gain = oldHealth < this.#currentHealth ? 'Gained' : 'Lost';
      const diff = Math.abs(this.#currentHealth - oldHealth);
      this.#lobby?.channel.sendMessage(`${gain} ${diff} lives. Now at ${this.#currentHealth}`);
      if (this.#currentHealth < 1) this.#matchCompleted();
      else this.#nextSong();
   }

   async #nextSong() {
      if (!this.#lobby) throw new Error('Next song but no lobby found');

      const candidateMaps = await mapsDb
         .find({
            $or: [
               { "ratings.nm.rating": { $gt: this.#completedRating, $lte: this.#completedRating + 100 } },
               { "ratings.hd.rating": { $gt: this.#completedRating, $lte: this.#completedRating + 100 } },
               { "ratings.hr.rating": { $gt: this.#completedRating, $lte: this.#completedRating + 100 } },
               { "ratings.dt.rating": { $gt: this.#completedRating, $lte: this.#completedRating + 100 } }
            ]
         })
         .toArray();
      const randMap = candidateMaps[(Math.random() * candidateMaps.length) | 0];
      const availableMods = (['nm', 'hd', 'hr', 'dt'] as SimpleMod[])
         .filter(mod =>
            randMap.ratings[mod].rating >= this.#completedRating
            && randMap.ratings[mod].rating <= this.#completedRating + 100
         );
      const randMod = availableMods[(Math.random() * availableMods.length) | 0];
      // Set the map and update the next rating range
      await this.#lobby.setMap(randMap.id, Mode[this.#mode === 'fruits' ? 'ctb' : this.#mode]);
      await this.#lobby.setMods(randMod);
      this.#nextRating = randMap.ratings[randMod].rating; 
   }

   #matchCompleted() {
      this.#lobby?.channel.sendMessage("Lobby finished - not fully implemented");
      setTimeout(this.closeLobby, 5000);
   }

   async closeLobby() {
      process.off("SIGTERM", this.#interruptHandler);
      try {
         this.#lobby?.removeAllListeners();
         this.#lobby?.channel.removeAllListeners();
         await this.#lobby?.closeLobby().catch(err => console.warn(err));
      } catch (err) {
         console.warn("Couldn't clean up properly");
         console.warn(err);
      } finally {
         this.emit("closed");
      }
   }

   hasPlayer(player: BanchoUser) {
      return this.#player.username === player.username;
   }

   invite(player: BanchoUser) {
      this.#lobby?.invitePlayer(`#${player.id}`);
   }
}

export default LobbyRef;
