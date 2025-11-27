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
import { DbBeatmap } from "../types/database.beatmap";
import { Filter } from "mongodb";

const STEP_SIZE = 20;

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
   #maniamode: "4k" | "7k" | null;
   #player;
   #interruptHandler;
   #targetRating;
   #ratingDeviation;
   #expandedRating;
   #currentHealth;
   #songHistory: Set<number>;
   #setHistory: Set<number>;
   #currentPick: {
      id: number;
      setid: number;
      rating: number;
      mod: SimpleMod;
   };

   constructor(player: BanchoUser, bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#maniamode = null;
      this.#player = player;
      this.#targetRating = 1500;
      this.#ratingDeviation = 350;
      this.#expandedRating = 0;
      this.#currentHealth = 50;
      this.#songHistory = new Set();
      this.#setHistory = new Set();
      // Current pick will be set whenever nextMap runs. The only time it's referenced is after a map finishes.
      // If I check for it myself all I would do is throw an error to make typescript stop complaining.
      // A default null reference error will serve literally the exact same purpose
      this.#currentPick = { mod: "nm" } as any;
      this.#interruptHandler = () => {
         this.#lobby?.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      };
   }

   setManiaMode(maniamode: "4k" | "7k") {
      this.#maniamode = maniamode;
   }

   async startMatch() {
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("SIGTERM", this.#interruptHandler);
      // Fetch the rating information for this player
      const dbplayer = await playersDb.findOne({ _id: this.#player.id });
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
         mania: [2.56953, 4.26502, 25]
      };
      const fail = +!score.pass * 10;
      const [a, b, c] = coef[this.#mode];
      const hpMod = Math.round((a * Math.pow(score.score, b)) / Math.pow(10, c)) - 5;
      return hpMod - fail;
   }

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      this.#songHistory.add(this.#currentPick.id);
      this.#setHistory.add(this.#currentPick.setid);
      // If the current song was close to the upper limit, raise the upper limit
      this.#expandedRating = Math.max(
         this.#currentPick.rating - (this.#targetRating + this.#ratingDeviation) + STEP_SIZE,
         this.#expandedRating + 1
      );
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

      // Increase lower limit at half the speed of upper limit
      const minRating = this.#targetRating - this.#ratingDeviation + this.#expandedRating / 2;
      const maxRating = this.#targetRating + this.#ratingDeviation + this.#expandedRating;
      const filter: Filter<DbBeatmap> = {
         _id: { $nin: Array.from(this.#songHistory) },
         setid: { $nin: Array.from(this.#setHistory) },
         "rating.rating": {
            $gt: minRating,
            $lt: maxRating
         }
         // $or: [
         //    {
         //       "ratings.nm.rating": {
         //          $gt: minRating,
         //          $lt: maxRating
         //       }
         //    },
         //    this.#currentPick.mod !== "hd" && {
         //       "ratings.hd.rating": {
         //          $gt: minRating,
         //          $lt: maxRating
         //       }
         //    },
         //    this.#currentPick.mod !== "hr" && {
         //       "ratings.hr.rating": {
         //          $gt: minRating,
         //          $lt: maxRating
         //       }
         //    },
         //    this.#currentPick.mod !== "dt" && {
         //       "ratings.dt.rating": {
         //          $gt: minRating,
         //          $lt: maxRating
         //       }
         //    }
         // ].filter(v => v) as Filter<DbBeatmap>[]
      };
      if (this.#mode === "mania" && this.#maniamode) filter.cs = this.#maniamode === "7k" ? 7 : 4;
      // Try to get a map
      let randMap: DbBeatmap | null = null;
      while (!randMap) {
         const pipeline = [{ $match: filter }, { $sample: { size: 1 } }];
         randMap = await mapsDb[this.#mode].aggregate<DbBeatmap>(pipeline).next();
         if (!randMap) {
            if ("setid" in filter) delete filter.setid;
            else if ("_id" in filter) delete filter._id;
            else {
               console.log(
                  `Unable to find ${
                     this.#mode
                  } map in range ${minRating.toFixed()} - ${maxRating.toFixed()}`
               );
               // Just pick literally anything
               pipeline.shift();
               if (this.#mode === "mania" && this.#maniamode)
                  pipeline.unshift({ $match: { cs: this.#maniamode === "7k" ? 7 : 4 } });
               randMap = await mapsDb[this.#mode].aggregate<DbBeatmap>(pipeline).next();
            }
         }
      }

      const availableMods = (["nm", "hd", "hr", "dt"] as SimpleMod[]).filter(
         mod =>
            (mod !== this.#currentPick.mod || mod === "nm") &&
            randMap.rating.rating * (randMap.mods[mod.toUpperCase()] || 1) > minRating &&
            randMap.rating.rating * (randMap.mods[mod.toUpperCase()] || 1) < maxRating
      );
      const randMod = availableMods[(Math.random() * availableMods.length) | 0] || "nm";
      // Set the map and update the next rating range
      await this.#lobby.setMap(randMap._id, Mode[this.#mode === "fruits" ? "ctb" : this.#mode]);
      await this.#lobby.setMods(randMod, this.#mode === "mania");
      this.#currentPick = {
         id: randMap._id,
         setid: randMap.setid,
         mod: randMod,
         rating: randMap.rating.rating
      };
      const randUpper = randMod.toUpperCase();
      this.#lobby.channel.sendMessage(
         `${randMap.title} +${randUpper} - Rating: ${randMap.rating.rating.toFixed()} x${(
            randMap.mods[randUpper] || 1
         ).toFixed(2)} (${(randMap.rating.rating * (randMap.mods[randUpper] || 1)).toFixed()})`
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
