import {
   BanchoClient,
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoMessage,
   BanchoLobbyPlayer,
   BanchoUser,
   BanchoLobbyPlayerScore,
   BanchoMods
} from "bancho.js";
import { Mode } from "nodesu";
import EventEmitter from "node:events";
import { GameMode, Rating, SimpleMod } from "../types/global";
import { mapsDb, playersDb } from "../db/connection";
import { DbBeatmap } from "../types/database.beatmap";
import { Filter } from "mongodb";
import { DbPlayer } from "../types/database.player";
import { RatingSet } from "../types/lobby";

const TARGET_SCORE = 750000;


class LobbyRef extends EventEmitter<{
   finished: [
      mp: number,
      lobbyState: {
         mode: GameMode;
      }
   ];
   closed: [mp: number];
}> {
   #bancho;
   #lobby?: BanchoLobby;
   #mode;
   #maniamode: "4k" | "7k" | null;
   #interruptHandler;
   #players: Partial<DbPlayer>[];
   #targetRating;
   #ratingDeviation;
   #songHistory: number[];
   #setHistory: number[];
   #currentPick: {
      id: number;
      setid: number;
      ratings: RatingSet;
      doubleTime: boolean;
   };
   #closeTimer: NodeJS.Timeout | null;

   constructor(bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#maniamode = null;
      this.#players = [];
      this.#targetRating = 1500;
      this.#ratingDeviation = 350;
      this.#songHistory = [];
      this.#setHistory = [];
      this.#closeTimer = null;
      // Current pick will be set whenever nextMap runs. The only time it's referenced is after a map finishes.
      // If I check for it myself all I would do is throw an error to make typescript stop complaining.
      // A default null reference error will serve literally the exact same purpose
      this.#currentPick = { doubleTime: false } as any;
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
      // Create the lobby
      const mpChannel = await this.#bancho.createLobby(
         `Auto lobby | Auto next song | ${this.#maniamode || this.#mode}`
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
      this.#lobby.on("playerJoined", this.#playerJoined);
      // Set up events for match gameplay
      this.#lobby.on("allPlayersReady", this.#playersReady);
      this.#lobby.on("playerLeft", this.#playerLeft.bind(this));
      this.#lobby.on("matchFinished", this.#songFinished.bind(this) as () => void);
      // Make the lobby public
      //this.#lobby.setPassword('');
      // Set freemod initially
      this.#lobby.setMods('', true);
   }

   async invitePlayer(player: BanchoUser) {
      console.log("Invite player", player.username);
      return this.#lobby?.invitePlayer(`#${player.id}`);
   }

   #playerJoined = async ({ player }: { player: BanchoLobbyPlayer }) => {
      console.log(`${player.user.ircUsername} joined the lobby`);
      // If we're getting ready to close the lobby, don't do that
      if (this.#closeTimer) {
         clearTimeout(this.#closeTimer);
         this.#closeTimer = null;
      }
      // Make sure we have info for this player
      if (!player.user.id)
         await player.user.fetchFromAPI();
      // Add them to our player list
      const dbPlayer = await playersDb.findOne({ osuid: player.user.id });
      if (dbPlayer)
         this.#players.push(dbPlayer);
      else
         this.#players.push({ osuid: player.user.id, [this.#mode]: { pve: { rating: 1500, rd: 350 }}});
      this.#calcTargetRating();
      // Get the map
      if (this.#players.length === 1)
         this.#nextSong();
   }

   async #playerLeft(player: BanchoLobbyPlayer) {
      if (!this.#lobby) throw new Error("Player left but no lobby");
      // If there's less than two players in the lobby, make sure the count is correct
      if (this.#lobby.slots.filter(s => s).length < 2)
         await this.#lobby.updateSettings();
      // If there are no players left, start a timer to close the lobby
      if (this.#lobby.slots.filter(s => s).length < 1) {
         this.#closeTimer = setTimeout(this.#matchCompleted, 20 * 60 * 1000);
         // Take this opportunity to concretely re-establish list parity
         this.#players = [];
      }
      else {
         // Remove this player from rating calcs
         const playerIndex = this.#players.findIndex(p => p.osuid === player.user.id);
         this.#players.splice(playerIndex, 1);
         this.#calcTargetRating();
      }
   }

   #calcTargetRating = () => {
      // Take an average rating from all players, where the highest rating
      // player has the largest impact. Sort in descending order of rating
      this.#players.sort((a, b) => (b[this.#mode]?.pve.rating || 0) - (a[this.#mode]?.pve.rating || 0));
      const { sum, count, rdSum } = this.#players.reduce((agg, player, i) => {
         agg.sum += (player[this.#mode]?.pve.rating || 0) / (i + 1);
         agg.count += 1 / (i + 1);
         const rd = (player[this.#mode]?.pve.rd || 0);
         agg.rdSum += rd * rd / (i + 1);
         return agg;
      }, { sum: 0, count: 0, rdSum: 0 });
      this.#targetRating = sum / count;
      this.#ratingDeviation = Math.sqrt(rdSum);
   }

   #handleLobbyMessage = async (msg: BanchoMessage) => {
      
   };

   #playersReady = async () => {
      this.#lobby?.startMatch(5);
   };

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      this.#songHistory.push(this.#currentPick.id);
      if (this.#songHistory.length > 50) this.#songHistory.shift();
      this.#setHistory.push(this.#currentPick.setid);
      if (this.#setHistory.length > 50) this.#setHistory.shift();

      // Get the song's rating
      const songRating = this.#currentPick.ratings[this.#currentPick.doubleTime ? 'dt' : 'nm'];
      // Find the mean and stdev for scores
      console.log(scores);
      // If there's only one player, don't bother adjusting anything
      if (scores.length > 1) {
         const scoreSum = scores.reduce((sum, score) => sum + score.score, 0);
         const averageScore = scoreSum / scores.length;
         const scoreStdev = Math.sqrt(scores.reduce((agg, score) => {
            const diff = score.score - averageScore;
            return agg + diff * diff;
         }, 0) / (scores.length - 1));

         // Adjust individual player ratings based on their performance
         scores.forEach((score) => {
            const player = this.#players.find(p => p.osuid === score.player.user.id);
            if (!player) return;
            const pve = player[this.#mode]?.pve;
            if (!pve) return;
            // How far from the target should they be, based on their rating
            const combinedRatingStdev = Math.sqrt(pve.rd * pve.rd + songRating.rd * songRating.rd);
            const expectedDifference = (pve.rating - songRating.rating) / combinedRatingStdev;
            const actualDifference = (score.score - averageScore) / scoreStdev;
            // Adjust the player's rating towards the actual difference
            // Ratings are generally in the thousands. Deviation differences should be single digit
            // That means this should be a relatively small change in the grand scheme of things
            pve.rating += (actualDifference - expectedDifference);
         })
      }
      // Recalculate the target rating and pick another song
      this.#calcTargetRating();
      this.#nextSong();
   }

   async #nextSong() {
      if (!this.#lobby) throw new Error("Next song but no lobby found");

      // Increase lower limit at half the speed of upper limit
      const minRating = this.#targetRating - this.#ratingDeviation / 2;
      const maxRating = this.#targetRating + this.#ratingDeviation / 2;
      const filter: Filter<DbBeatmap> = {
         _id: { $nin: this.#songHistory },
         setid: { $nin: this.#setHistory },
         $or: [
            {
               "ratings.nm.rating": {
                  $gt: minRating,
                  $lt: maxRating
               }
            },
            {
               "ratings.hd.rating": {
                  $gt: minRating,
                  $lt: maxRating
               }
            },
            {
               "ratings.hr.rating": {
                  $gt: minRating,
                  $lt: maxRating
               }
            },
            {
               "ratings.dt.rating": {
                  $gt: minRating,
                  $lt: maxRating
               }
            }
         ].filter(v => v) as Filter<DbBeatmap>[]
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
            randMap.ratings[mod]?.rating > minRating &&
            randMap.ratings[mod]?.rating < maxRating
      );
      const randMod = availableMods[(Math.random() * availableMods.length) | 0] || "nm";
      // Set the map and update the next rating range
      await this.#lobby.setMap(randMap._id, Mode[this.#mode === "fruits" ? "ctb" : this.#mode]);
      // Only set mods if switching to/from dt
      const isDt = randMod === 'dt'
      if (this.#currentPick.doubleTime !== isDt)
         await this.#lobby.setMods(isDt ? 'dt' : '', true);
      this.#currentPick = {
         id: randMap._id,
         setid: randMap.setid,
         ratings: randMap.ratings,
         doubleTime: isDt
      };
      this.#lobby.channel.sendMessage(
         `${randMap.title}${isDt ? ` +DT` : ''} - Rating: ${randMap.ratings[
            isDt ? 'dt' : 'nm'
         ].rating.toFixed()}`
      );
   }

   #matchCompleted = () => {
      if (!this.#lobby) throw new Error("Match finished but no lobby");
      this.#lobby.channel.sendMessage("Lobby finished - submitting result to server");
      this.#lobby.removeAllListeners("playerLeft");
      this.emit("finished", this.#lobby.id, {
         mode: this.#mode
      });
      setTimeout(this.closeLobby.bind(this), 5000);
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
}

export default LobbyRef;
