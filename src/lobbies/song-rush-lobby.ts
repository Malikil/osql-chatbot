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
import { GameMode, SimpleMod } from "../types/global";
import { mapsDb, playersDb } from "../db/connection";
import { DbBeatmap } from "../types/database.beatmap";
import { Filter } from "mongodb";
import LobbyBase from "./lobby-base";
import { effectiveRating, MAX_TARGETS, MIN_TARGETS } from "../helpers/ratings";

const STEP_SIZE = 10;

class SongRushLobby extends LobbyBase {
   #player;
   #lobbyEnding?: () => void;
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
      dt: boolean;
   };

   constructor(player: BanchoUser, mode: GameMode = "osu") {
      super(player.banchojs, mode);
      console.log("Set up lives instance");
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
      this.#currentPick = {} as any;
   }

   protected async _createLobby(): Promise<BanchoLobby> {
      const channel = await this._bancho.createLobby(
         `Score Rush ${this.#player.username} - ${Date.now()}`
      );
      return channel.lobby;
   }
   protected override async _startMatch() {
      // Fetch the rating information for this player
      const dbplayer = await playersDb.findOne({ _id: this.#player.id });
      if (dbplayer) {
         this.#targetRating = dbplayer[this.mode].pve.rating;
         this.#ratingDeviation = dbplayer[this.mode].pve.rd;
      }
      await this.lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         8
      );
      // Invite player
      await this.invitePlayer(this.#player);
   }

   protected override async _onPlayerJoined({
      player
   }: {
      player: BanchoLobbyPlayer;
      slot: number;
      team: string;
   }) {
      if (player.user.id === this.#player.id) {
         if (this.#lobbyEnding) {
            await this.lobby.abortTimer();
            this.lobby.off("timerEnded", this.#lobbyEnding);
            this.lobby.channel.sendMessage("PvE player rejoined");
         }
         this.#nextSong();
      }
   }

   protected async _onPlayerLeft(player: BanchoLobbyPlayer): Promise<void> {
      const lobbyid = this.lobby.id;
      // If the primary player leaves, close the lobby
      if (player.user.username === this.#player.username) {
         this.lobby.channel.sendMessage("PvE player left. Lobby will close");
         this.lobby.startTimer(60);
         this.#lobbyEnding = () => {
            if (!this.#lobbyEnding) throw new Error("Missing lobby ending reference");
            this.lobby.off("timerEnded", this.#lobbyEnding);
            this.emit("finished", lobbyid);
            this.closeLobby();
         };
         this.lobby.on("timerEnded", this.#lobbyEnding);
      }
   }

   protected async _onLobbyMessage(msg: BanchoMessage): Promise<void> {
      if (msg.user.username === this.#player.username) {
         if (msg.content === "skip") {
            if (this.#currentHealth < 2)
               this.lobby.channel.sendMessage("Not enough life to skip song");
            else {
               this.#currentHealth -= 1;
               this.lobby.channel.sendMessage(
                  `Skipping song. New life count: ${this.#currentHealth}`
               );
               await this.#nextSong();
            }
         }
      }
   }

   #hpCalc(score?: BanchoLobbyPlayerScore) {
      if (!score) return -15;
      const fail = +!score.pass * 10;
      const min = MIN_TARGETS[this.mode];
      const max = MAX_TARGETS[this.mode];
      const mid = (max + min) / 2;
      const w = (max - min) / 2;
      const hpMod = Math.floor(6 * Math.tanh((score.score - mid) / w));
      return hpMod - fail;
   }

   protected async _onSongFinished(scores: BanchoLobbyPlayerScore[]): Promise<void> {
      this.#songHistory.add(this.#currentPick.id);
      this.#setHistory.add(this.#currentPick.setid);
      // Raise the rating limits
      this.#expandedRating += STEP_SIZE;
      const playerScore = scores.find(s => s.player.user.id === this.#player.id);
      const oldHealth = this.#currentHealth;
      // Calculate the new health value
      const hpMod = this.#hpCalc(playerScore);
      this.#currentHealth = Math.min(this.#currentHealth + hpMod, 99);
      // Message new health value
      const gain = oldHealth < this.#currentHealth ? "Gained" : "Lost";
      const diff = Math.abs(this.#currentHealth - oldHealth);
      this.lobby.channel.sendMessage(`${gain} ${diff} lives. Now at ${this.#currentHealth}`);
      if (this.#currentHealth < 1) this.#matchCompleted();
      else this.#nextSong();
   }

   async #nextSong() {
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
      };
      if (this.mode === "mania" && this._maniamode) filter.cs = this._maniamode === "7k" ? 7 : 4;
      // Try to get a map
      let randMap: DbBeatmap | null = null;
      let anythingAttempted = false;
      while (!randMap) {
         const pipeline = [{ $match: filter }, { $sample: { size: 1 } }];
         randMap = await mapsDb[this.mode].aggregate<DbBeatmap>(pipeline).next();
         if (!randMap) {
            if ("setid" in filter) delete filter.setid;
            else if ("_id" in filter) delete filter._id;
            else if (anythingAttempted) throw new Error("Music is fake");
            else {
               anythingAttempted = true;
               console.log(
                  `Unable to find ${
                     this.mode
                  } map in range ${minRating.toFixed()} - ${maxRating.toFixed()}`
               );
               // Just pick literally anything
               pipeline.shift();
               if (this.mode === "mania" && this._maniamode)
                  pipeline.unshift({ $match: { cs: this._maniamode === "7k" ? 7 : 4 } });
               randMap = await mapsDb[this.mode].aggregate<DbBeatmap>(pipeline).next();
            }
         }
      }

      const dtMult = randMap.mods["DT"] || 1;
      const dtRating = effectiveRating(randMap.rating, this.mode, dtMult);
      const dtAvailable = dtRating > minRating && dtRating < maxRating;
      const setDt = dtAvailable && !this.#currentPick.dt && Math.random() > 0.5;
      // Set the map and update the next rating range
      await this.lobby.setMap(randMap._id, Mode[this.mode === "fruits" ? "ctb" : this.mode]);
      if (this.#currentPick.dt !== setDt) await this.lobby.setMods(setDt ? "DT" : "", true);
      this.#currentPick = {
         id: randMap._id,
         setid: randMap.setid,
         dt: setDt,
         rating: randMap.rating.rating
      };

      if (setDt)
         this.lobby.channel.sendMessage(
            `${randMap.title} +DT - Rating: ${dtRating.toFixed()} (${randMap.rating.rating.toFixed()} x${dtMult.toFixed(
               2
            )}) | HD ${effectiveRating(
               randMap.rating,
               this.mode,
               dtMult * (randMap.mods["HD"] || 1)
            ).toFixed()}, HR ${effectiveRating(
               randMap.rating,
               this.mode,
               dtMult * (randMap.mods["HR"] || 1)
            ).toFixed()}`
         );
      else
         this.lobby.channel.sendMessage(
            `${randMap.title} - Rating: ${randMap.rating.rating.toFixed()} | HD ${effectiveRating(
               randMap.rating,
               this.mode,
               randMap.mods["HD"] || 1
            ).toFixed()}, HR ${effectiveRating(randMap.rating, this.mode, randMap.mods["HR"] || 1).toFixed()}`
         );
   }

   #matchCompleted = () => {
      this.lobby.channel.sendMessage("Lobby finished - submitting result to server");
      this.emit("finished", this.lobby.id);
      this.closeLobby(15000);
   };

   override hasPlayer(player: BanchoUser) {
      return this.#player.username === player.username;
   }
}

export default SongRushLobby;
