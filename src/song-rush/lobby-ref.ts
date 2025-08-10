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
import { Mode } from "nodesu";
import EventEmitter from "node:events";
import { GameMode, SimpleMod } from "../types/global";
import { mapsDb, playersDb } from "../db/connection";

const STEP_SIZE = 10;

class LobbyRef extends EventEmitter<{
   finished: [
      mp: number,
      lobbyState: {
         player: number;
         mode: GameMode;
         lives: number;
      }
   ];
   paused: [
      mp: number,
      lobbyState: {
         player: number;
         mode: GameMode;
         lives: number;
      }
   ];
   closed: [mp: number];
}> {
   #bancho;
   #lobby?: BanchoLobby;
   #mode;
   #player;
   #interruptHandler;
   #targetRating;
   #ratingDeviation;
   #expandedRating;
   #currentHealth;
   #lastMod: SimpleMod;
   #songHistory: number[];

   constructor(player: BanchoUser, bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#player = player;
      this.#targetRating = 1500;
      this.#ratingDeviation = 350;
      this.#expandedRating = 0;
      this.#currentHealth = 50;
      this.#lastMod = "nm";
      this.#songHistory = [];
      this.#interruptHandler = () => {
         this.#lobby?.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      };
   }

   async startMatch() {
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("SIGTERM", this.#interruptHandler);
      // Fetch the rating information for this player
      const dbplayer = await playersDb.findOne({ osuid: this.#player.id });
      if (dbplayer) {
         this.#targetRating = dbplayer[this.#mode].pve.rating;
         this.#ratingDeviation = dbplayer[this.#mode].pve.rd;
      }
      // Create the lobby
      const mpChannel = await this.#bancho.createLobby(
         `Score Rush ${this.#player.username} - ${Date.now()}`
      );
      this.#lobby = mpChannel.lobby;
      mpChannel.on("message", this.#handleLobbyMessage);

      console.log(`Created ${this.#mode} lobby: ${mpChannel.name}`);
      await this.#lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         8
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
      this.#lobby.on("allPlayersReady", this.#playersReady);
      this.#lobby.on("playerLeft", this.#playerLeft.bind(this));
      this.#lobby.on("matchFinished", this.#songFinished.bind(this) as () => void);
      // Invite player
      console.log("Invite player");
      await this.#lobby.invitePlayer(`#${this.#player.id}`);
   }

   async #playersJoined() {
      console.log(`${this.#lobby?.id} - All players joined`);
      // Get the map
      this.#nextSong();
   }

   async #playerLeft(player: BanchoLobbyPlayer) {
      if (!this.#lobby) throw new Error("Player left but no lobby");
      const lobbyid = this.#lobby.id;
      // If the primary player leaves, close the lobby
      if (player.user.username === this.#player.username) {
         this.#lobby.off("allPlayersReady", this.#playersReady);
         this.#lobby.channel.sendMessage("PvE player left. Lobby will close");
         this.#lobby.startTimer(60);
         const pauseLobby = () => {
            this.#lobby?.off("timerEnded", pauseLobby);
            this.emit("paused", lobbyid, {
               player: this.#player.id,
               mode: this.#mode,
               lives: this.#currentHealth
            });
            this.closeLobby();
         };
         this.#lobby.on("timerEnded", pauseLobby);
         const playerRejoined = ({ player }: { player: BanchoLobbyPlayer }) => {
            console.log(`${player.user.username} rejoined`);
            if (player.user.username === this.#player.username) {
               this.#lobby?.channel.sendMessage("PvE player rejoined");
               this.#lobby?.abortTimer();
               this.#lobby?.off("timerEnded", pauseLobby);
               this.#lobby?.on("allPlayersReady", this.#playersReady);
               this.#lobby?.off("playerJoined", playerRejoined);
            }
         };
         this.#lobby.on("playerJoined", playerRejoined);
      }
   }

   #handleLobbyMessage = async (msg: BanchoMessage) => {
      if (msg.user.username === this.#player.username) {
         if (msg.content === "skip") {
            if (this.#currentHealth < 2)
               this.#lobby?.channel.sendMessage("Not enough life to skip song");
            else {
               this.#currentHealth -= 1;
               this.#lobby?.channel.sendMessage(
                  `Skipping song. New life count: ${this.#currentHealth}`
               );
               await this.#nextSong();
            }
         }
      }
   };

   #playersReady = async () => {
      this.#lobby?.startMatch(3);
   };

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
      const hpMod = (((a * Math.pow(score.score, b)) / Math.pow(10, c)) | 0) - 5;
      return hpMod - fail;
   }

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      console.log(scores);
      this.#expandedRating += STEP_SIZE;
      const playerScore = scores.find(s => s.player.user.id === this.#player.id);
      const oldHealth = this.#currentHealth;
      // Calculate the new health value
      const hpMod = this.#hpCalc(playerScore);
      this.#currentHealth = Math.min(this.#currentHealth + hpMod, 99);
      // Message new health value
      const gain = oldHealth < this.#currentHealth ? "Gained" : "Lost";
      const diff = Math.abs(this.#currentHealth - oldHealth);
      this.#lobby?.channel.sendMessage(`${gain} ${diff} lives. Now at ${this.#currentHealth}`);
      if (this.#currentHealth < 1) this.#matchCompleted();
      else this.#nextSong();
   }

   async #nextSong() {
      if (!this.#lobby) throw new Error("Next song but no lobby found");

      const candidateMaps = await mapsDb
         .find({
            mode: this.#mode,
            $or: [
               {
                  "ratings.nm.rating": {
                     $gt: this.#targetRating - this.#ratingDeviation,
                     $lt: this.#targetRating + this.#expandedRating + this.#ratingDeviation
                  }
               },
               this.#lastMod !== "hd" && {
                  "ratings.hd.rating": {
                     $gt: this.#targetRating - this.#ratingDeviation,
                     $lt: this.#targetRating + this.#expandedRating + this.#ratingDeviation
                  }
               },
               this.#lastMod !== "hr" && {
                  "ratings.hr.rating": {
                     $gt: this.#targetRating - this.#ratingDeviation,
                     $lt: this.#targetRating + this.#expandedRating + this.#ratingDeviation
                  }
               },
               this.#lastMod !== "dt" && {
                  "ratings.dt.rating": {
                     $gt: this.#targetRating - this.#ratingDeviation,
                     $lt: this.#targetRating + this.#expandedRating + this.#ratingDeviation
                  }
               }
            ].filter(v => v) as any
         })
         .toArray();
      const randMap = candidateMaps[(Math.random() * candidateMaps.length) | 0];
      const availableMods = (["nm", "hd", "hr", "dt"] as SimpleMod[]).filter(
         mod =>
            (mod !== this.#lastMod || mod === "nm") &&
            randMap.ratings[mod].rating > this.#targetRating - this.#ratingDeviation &&
            randMap.ratings[mod].rating <
               this.#targetRating + this.#expandedRating + this.#ratingDeviation
      );
      const randMod = availableMods[(Math.random() * availableMods.length) | 0];
      // Set the map and update the next rating range
      await this.#lobby.setMap(randMap.id, Mode[this.#mode === "fruits" ? "ctb" : this.#mode]);
      await this.#lobby.setMods(randMod);
      this.#lastMod = randMod;
      this.#lobby.channel.sendMessage(
         `${randMap.title} +${randMod.toUpperCase()} - Rating: ${randMap.ratings[
            randMod
         ].rating.toFixed()}`
      );
   }

   #matchCompleted = () => {
      if (!this.#lobby) throw new Error("Match finished but no lobby");
      this.#lobby.channel.sendMessage("Lobby finished - submitting result to server");
      this.#lobby.removeAllListeners("playerLeft");
      this.emit("finished", this.#lobby.id, {
         player: this.#player.id,
         mode: this.#mode,
         lives: this.#currentHealth
      });
      setTimeout(this.closeLobby.bind(this), 15000);
   };

   async closeLobby() {
      const mp = this.#lobby?.id || 0;
      process.off("SIGTERM", this.#interruptHandler);
      try {
         this.#lobby?.off("allPlayersReady", this.#playersReady);
         // I actually can't guarantee banchojs doesn't maintain its own listeners. It probably *is* bad practice to remove
         // listeners here if I haven't explicitly added them myself.
         this.#lobby?.removeAllListeners();
         this.#lobby?.channel.off("message", this.#handleLobbyMessage);
         await this.#lobby?.closeLobby().catch(err => console.warn(err));
      } catch (err) {
         console.warn("Couldn't clean up properly");
         console.warn(err);
      } finally {
         this.emit("closed", mp);
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
