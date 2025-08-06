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
      mpChannel.on("message", this.#handleLobbyMessage.bind(this));

      console.log(`Created lobby: ${mpChannel.name}`);
      await this.#lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2
      );
      // Set up lobby listeners
      const playerJoined = ({ player }: { player: BanchoLobbyPlayer }) => {
         console.log(`${player.user.username} joined the lobby`);
         if (player.user.username === this.#player.username) {
            // Stop waiting for players to join
            this.#lobby?.off("playerJoined", playerJoined);
            this.#playersJoined();
         }
      };
      this.#lobby.on("playerJoined", playerJoined);
      // Set up events for match gameplay
      this.#lobby.on('allPlayersReady', this.#playersReady);
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

   async #playerLeft(player: BanchoLobbyPlayer) {
      if (!this.#lobby) throw new Error('Player left but no lobby');
      // If the primary player leaves, close the lobby
      if (player.user.username === this.#player.username)
      {
         this.#lobby.off('allPlayersReady', this.#playersReady);
         this.#lobby.channel.sendMessage('PvE player left. Lobby will close');
         this.#lobby.startTimer(60);
         this.#lobby.on('timerEnded', this.#matchCompleted);
         const playerRejoined = ({ player }: { player: BanchoLobbyPlayer }) => {
            console.log(`${player.user.username} rejoined`);
            if (player.user.username === this.#player.username) {
               this.#lobby?.channel.sendMessage('PvE player rejoined');
               this.#lobby?.abortTimer();
               this.#lobby?.off('timerEnded', this.#matchCompleted);
               this.#lobby?.on('allPlayersReady', this.#playersReady);
               this.#lobby?.off('playerJoined', playerRejoined);
            }
         }
         this.#lobby.on('playerJoined', playerRejoined)
      }
   }

   async #handleLobbyMessage(msg: BanchoMessage) {
      if (msg.user.username === this.#player.username) {
         if (msg.content === 'skip') {
            if (this.#currentHealth < 2) this.#lobby?.channel.sendMessage("Not enough life to skip song");
            else {
            this.#currentHealth -= 1;
            this.#lobby?.channel.sendMessage(`Skipping song. New life count: ${this.#currentHealth}`);
            await this.#nextSong();
            }
         }
      }
   }

   #playersReady = async () => {
      this.#lobby?.startMatch(5);
   }

   #hpCalc(score?: BanchoLobbyPlayerScore) {
      if (!score) return -15;
      const coef = {
         osu: [3.49522, 2.40942, 14],
         fruits: [2.56953, 4.26502, 25],
         taiko: [2.30302, 3.10628, 18],
         mania: []
      };
      const fail = +!score.pass * 10;
      const [a, b, c] = coef[this.#mode];
      const hpMod = ((a * Math.pow(score.score, b) / Math.pow(10, c)) | 0) - 5;
      return hpMod - fail;
   }

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      console.log(scores);
      this.#completedRating = this.#nextRating;
      const playerScore = scores.find(s => s.player.user.id === this.#player.id);
      const oldHealth = this.#currentHealth;
      // Calculate the new health value
      const hpMod = this.#hpCalc(playerScore);
      this.#currentHealth = Math.min(this.#currentHealth + hpMod, 99);
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

   #matchCompleted = () => {
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
