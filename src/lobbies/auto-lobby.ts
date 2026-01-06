import {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoMessage,
   BanchoLobbyPlayer,
   BanchoLobbyPlayerScore,
   BanchoUser
} from "bancho.js";
import { Mode } from "nodesu";
import { GameMode, Rating } from "../types/global";
import { mapsDb, playersDb } from "../db/connection";
import { DbBeatmap } from "../types/database.beatmap";
import { Filter } from "mongodb";
import { DbPlayer } from "../types/database.player";
import LobbyBase from "./lobby-base";

class AutoLobby extends LobbyBase {
   #initPlayer;
   #players: Partial<DbPlayer>[];
   #targetRating;
   #ratingDeviation;
   #songHistory: number[];
   #setHistory: number[];
   #currentPick: {
      id: number;
      setid?: number;
      rating?: Rating;
      doubleTime: boolean;
   };
   #closeTimer: NodeJS.Timeout | null;
   #requestQueue: { map: number; dt: boolean }[];

   constructor(player: BanchoUser, mode: GameMode = "osu") {
      super(player.banchojs, mode);
      console.log("Set up ref instance");
      this.#initPlayer = player;
      this.#players = [];
      this.#targetRating = 1500;
      this.#ratingDeviation = 350;
      this.#songHistory = [];
      this.#setHistory = [];
      this.#closeTimer = null;
      this.#requestQueue = [];
      // Current pick will be set whenever nextMap runs. The only time it's referenced is after a map finishes.
      // If I check for it myself all I would do is throw an error to make typescript stop complaining.
      // A default null reference error will serve literally the exact same purpose
      this.#currentPick = { doubleTime: false } as any;
   }

   protected async _createLobby(): Promise<BanchoLobby> {
      const channel = await this._bancho.createLobby(
         `Auto lobby | Auto pick songs | ${this._maniamode || this.mode}`
      );
      return channel.lobby;
   }
   
   protected async _startMatch() {
      await this.lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         8
      );
      // Make the lobby public
      //this.#lobby.setPassword('');
      // Set freemod initially
      this.lobby.setMods("", true);
      this.invitePlayer(this.#initPlayer);
   }

   protected async _onPlayerJoined({ player }: { player: BanchoLobbyPlayer; slot: number; team: string; }): Promise<void> {
      // If we're getting ready to close the lobby, don't do that
      if (this.#closeTimer) {
         clearTimeout(this.#closeTimer);
         this.#closeTimer = null;
      }
      // Make sure we have info for this player
      if (!player.user.id) await player.user.fetchFromAPI();
      // Add them to our player list
      const dbPlayer = await playersDb.findOne({ _id: player.user.id });
      if (dbPlayer) this.#players.push(dbPlayer);
      else
         this.#players.push({
            _id: player.user.id,
            [this.mode]: { pve: { rating: 1500, rd: 350 } }
         });
      this.#calcTargetRating();
      // Get the map
      if (this.#players.length === 1) this.#nextSong();
   };

   protected async _onPlayerLeft(player: BanchoLobbyPlayer): Promise<void> {
      // If there's less than two players in the lobby, make sure the count is correct
      if (this.lobby.slots.filter(s => s).length < 2) await this.lobby.updateSettings();
      // If there are no players left, start a timer to close the lobby
      if (this.lobby.slots.filter(s => s).length < 1) {
         this.#closeTimer = setTimeout(this.#matchCompleted, 20 * 60 * 1000);
         // Take this opportunity to concretely re-establish list parity
         this.#players = [];
      } else {
         // Remove this player from rating calcs
         const playerIndex = this.#players.findIndex(p => p._id === player.user.id);
         this.#players.splice(playerIndex, 1);
         this.#calcTargetRating();
      }
   }

   #calcTargetRating = () => {
      // Take an average rating from all players, where the highest rating
      // player has the largest impact. Sort in descending order of rating
      this.#players.sort(
         (a, b) => (b[this.mode]?.pve.rating || 0) - (a[this.mode]?.pve.rating || 0)
      );
      const { sum, count, rdSum } = this.#players.reduce(
         (agg, player, i) => {
            agg.sum += (player[this.mode]?.pve.rating || 0) / (i + 1);
            agg.count += 1 / (i + 1);
            const rd = player[this.mode]?.pve.rd || 0;
            agg.rdSum += (rd * rd) / (i + 1);
            return agg;
         },
         { sum: 0, count: 0, rdSum: 0 }
      );
      this.#targetRating = sum / count;
      this.#ratingDeviation = Math.sqrt(rdSum);
   };

   protected async _onLobbyMessage(msg: BanchoMessage): Promise<void> {
      if (msg.content.startsWith("!request ")) {
         const args = msg.content
            .split(" ")
            .map(v => v.trim())
            .filter(v => v);
         const mapId = parseInt(args[1]);
         if (mapId) {
            if (this.#requestQueue.some(s => s.map === mapId) || this.#songHistory.includes(mapId))
               this.lobby.channel.sendMessage("Map has already been requested");
            else {
               this.#requestQueue.push({ map: mapId, dt: args[2]?.toUpperCase() === "DT" });
               this.lobby.channel.sendMessage(`Added ${mapId} to queue`);
            }
         }
      }
   };

   protected async _onSongFinished(scores: BanchoLobbyPlayerScore[]): Promise<void> {
      this.#songHistory.push(this.#currentPick.id);
      if (this.#songHistory.length > 50) this.#songHistory.shift();
      if (this.#currentPick.setid) this.#setHistory.push(this.#currentPick.setid);
      if (this.#setHistory.length > 50) this.#setHistory.shift();

      // Get the song's rating
      const songRating = this.#currentPick.rating;
      // Find the mean and stdev for scores
      console.log(scores);
      // If there's only one player, don't bother adjusting anything
      if (songRating && scores.length > 1) {
         const scoreSum = scores.reduce((sum, score) => sum + score.score, 0);
         const averageScore = scoreSum / scores.length;
         const scoreStdev = Math.sqrt(
            scores.reduce((agg, score) => {
               const diff = score.score - averageScore;
               return agg + diff * diff;
            }, 0) /
               (scores.length - 1)
         );

         // Adjust individual player ratings based on their performance
         scores.forEach(score => {
            const player = this.#players.find(p => p._id === score.player.user.id);
            if (!player) return;
            const pve = player[this.mode]?.pve;
            if (!pve) return;
            // How far from the target should they be, based on their rating
            const combinedRatingStdev = Math.sqrt(pve.rd * pve.rd + songRating.rd * songRating.rd);
            const expectedDifference = (pve.rating - songRating.rating) / combinedRatingStdev;
            const actualDifference = (score.score - averageScore) / scoreStdev;
            // Adjust the player's rating towards the actual difference
            // Ratings are generally in the thousands. Deviation differences should be single digit
            // That means this should be a relatively small change in the grand scheme of things
            pve.rating += actualDifference - expectedDifference;
         });
      }
      // Recalculate the target rating and pick another song
      this.#calcTargetRating();
      this.#nextSong();
   }

   async #nextSong() {
      // If there's a requested song, pick that one
      if (this.#requestQueue.length > 0) {
         const nextMap = this.#requestQueue.shift();
         if (!nextMap) throw new Error("Array length > 1 but shift() undefined");
         this.lobby.channel.sendMessage(`Pick map ${nextMap.map}`);
         await this.lobby.setMap(nextMap.map, Mode[this.mode === "fruits" ? "ctb" : this.mode]);
         if (this.#currentPick.doubleTime !== nextMap.dt)
            await this.lobby.setMods(nextMap.dt ? "dt" : "", true);
         this.#currentPick = {
            id: nextMap.map,
            doubleTime: nextMap.dt
         };
         return;
      }

      // Increase lower limit at half the speed of upper limit
      const minRating = this.#targetRating - this.#ratingDeviation / 2;
      const maxRating = this.#targetRating + this.#ratingDeviation / 2;
      const filter: Filter<DbBeatmap> = {
         _id: { $nin: this.#songHistory },
         setid: { $nin: this.#setHistory },
         "rating.rating": {
            $gt: minRating,
            $lt: maxRating
         }
      };
      if (this.mode === "mania" && this._maniamode) filter.cs = this._maniamode === "7k" ? 7 : 4;
      // Try to get a map
      let randMap: DbBeatmap | null = null;
      while (!randMap) {
         const pipeline = [{ $match: filter }, { $sample: { size: 1 } }];
         randMap = await mapsDb[this.mode].aggregate<DbBeatmap>(pipeline).next();
         if (!randMap) {
            if ("setid" in filter) delete filter.setid;
            else if ("_id" in filter) delete filter._id;
            else {
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

      // Don't bother checking minRating
      const dtRating = randMap.rating.rating * (randMap.mods.DT || 1);
      const dtAvailable = dtRating < maxRating;
      const isDt = dtAvailable && Math.random() < 0.1;
      // Set the map and update the next rating range
      await this.lobby.setMap(randMap._id, Mode[this.mode === "fruits" ? "ctb" : this.mode]);
      // Only set mods if switching to/from dt
      if (this.#currentPick.doubleTime !== isDt) await this.lobby.setMods(isDt ? "dt" : "", true);
      this.#currentPick = {
         id: randMap._id,
         setid: randMap.setid,
         rating: randMap.rating,
         doubleTime: isDt
      };
      this.lobby.channel.sendMessage(
         `${randMap.title}${isDt ? ` +DT` : ""} - Rating: ${randMap.rating.rating.toFixed()}${
            isDt ? ` x${(randMap.mods.DT || 1).toFixed(2)} (${dtRating.toFixed()})` : ""
         }`
      );
   }

   #matchCompleted = () => {
      this.lobby.channel.sendMessage("Lobby finished - submitting result to server");
      this.emit('finished', this.lobby.id);
      this.closeLobby(5000);
   };
}

export default AutoLobby;
