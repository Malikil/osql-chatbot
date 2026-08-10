import {
   BanchoLobby,
   BanchoLobbyPlayer,
   BanchoLobbyPlayerScore,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoMessage,
   BanchoUser,
   BanchoClient
} from "bancho.js";

import { GameMode, Mod } from "../../types/global";
import MpLobbyBase from "./mp-lobby-base";
import { mapsDb, playersDb } from "../../db/connection";
import { gaussianRandom, logit, sigmoid } from "../../helpers/mathplus";
import { predictOutcome, scoreFromResult } from "../../helpers/ratings";
import { Mappool } from "../../types/lobby";

export default class PvELobbyRef extends MpLobbyBase {
   #player: BanchoUser;
   #playerRating = { rating: 1500, rd: 350, vol: 0.06 };
   #opponentRating = { rating: 1500, rd: 350 };
   #opponentSkills?: number[];
   #opponentMods = {
      HD: 1,
      HR: 1,
      DT: 1
   };
   #opponentTargetScore: number = 0;

   constructor(player: BanchoUser, mode: GameMode = "osu", variant?: "4k" | "7k") {
      super(player.banchojs, mode, 7, variant);
      this.#player = player;
   }

   protected async _createLobby(): Promise<BanchoLobby> {
      const dbplayer = await playersDb.findOne({ _id: this.#player.id });
      if (dbplayer) {
         this.#playerRating = {
            rating: dbplayer[this.mode].pve.rating,
            rd: dbplayer[this.mode].pve.rd,
            vol: dbplayer[this.mode].pve.vol || this.#playerRating.vol
         };
      }
      // Create opponent stats
      const [gauss1, gauss2] = gaussianRandom();
      this.#opponentRating = {
         rating: this.#playerRating.rating + gauss1 * this.#playerRating.rd,
         rd: this.#playerRating.rd + gauss2 * this.#playerRating.vol
      };
      // Boost the opponent's rating in the background to give the player a more realistic challenge.
      // This boost seems to cause generated scores to look more realistic in practice
      this.#opponentRating.rating += this.#opponentRating.rd;
      // Get the max/min style value across all skills for any gamemode
      const { maxStyle, minStyle } = (
         await playersDb
            .aggregate<{ maxStyle: number; minStyle: number }>([
               {
                  $project: {
                     stylesAll: {
                        $concatArrays: [
                           {
                              $ifNull: ["$osu.styles", []]
                           },
                           {
                              $ifNull: ["$taiko.styles", []]
                           },
                           {
                              $ifNull: ["$fruits.styles", []]
                           },
                           {
                              $ifNull: ["$mania.styles", []]
                           }
                        ]
                     }
                  }
               },
               {
                  $unwind: "$stylesAll"
               },
               {
                  $group: {
                     _id: null,
                     maxStyle: {
                        $max: "$stylesAll"
                     },
                     minStyle: {
                        $min: "$stylesAll"
                     }
                  }
               }
            ])
            .toArray()
      )[0];
      // Generate some random values for these skills
      const skillRange = maxStyle - minStyle;
      const skillMid = (maxStyle + minStyle) / 2;
      // If the player doesn't exist already just ignore skills for this lobby
      this.#opponentSkills = dbplayer?.[this.mode].styles.map(
         () => (Math.random() - 0.5) * skillRange + skillMid
      );
      // Get the max/min mod values
      const modRanges = await playersDb
         .aggregate<{ min: number; max: number; mod: Mod }>([
            { $project: { mods: { $objectToArray: `$${this.mode}.mods` } } },
            { $unwind: "$mods" },
            {
               $group: {
                  _id: "$mods.k",
                  min: { $min: "$mods.v" },
                  max: { $max: "$mods.v" }
               }
            },
            { $project: { _id: 0, mod: "$_id", min: 1, max: 1 } }
         ])
         .toArray();
      const randBetween = ({ min, max }: { min: number; max: number } = { min: 1, max: 1 }) =>
         Math.random() * (max - min) + min;
      this.#opponentMods = {
         HD: randBetween(modRanges.find(m => m.mod === "HD")),
         HR: randBetween(modRanges.find(m => m.mod === "HR")),
         DT: randBetween(modRanges.find(m => m.mod === "DT"))
      };

      const lobbyChannel = await this._bancho.createLobby(
         `Training Match - MPSQ: ${this.#player.username} (${this.#playerRating.rating.toFixed()}) vs ${(
            this.#opponentRating.rating - this.#opponentRating.rd
         ).toFixed()} Player - ${Date.now()}`
      );

      await lobbyChannel.lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         1
      );

      // Create a listener to calculate an opponent score once a map is started
      // Use the closing event to remove it
      // Calculate during gameplay so the player doesn't notice IO/Network lag time
      const generateOpponentScore = async () => {
         const currentPick = this._getActivePick();
         const dbMap = await mapsDb[this.mode].findOne({ _id: currentPick.map });
         const mapRating = dbMap?.rating || { rating: 1500, rd: 350 };
         const rawExpectedResult = predictOutcome(
            this.#opponentRating,
            mapRating,
            this.#opponentSkills,
            dbMap?.styles
         );
         // Add some variance
         const RD_SCALE = 0.5;
         const REFERENCE_RD = 100;
         const [sigma] = gaussianRandom(0, (RD_SCALE * this.#opponentRating.rd) / REFERENCE_RD);
         const generatedResult = sigmoid(logit(rawExpectedResult) + sigma);
         console.log('Result adjustment:', rawExpectedResult, generatedResult, generatedResult - rawExpectedResult);
         this.#opponentTargetScore = scoreFromResult(generatedResult, this.mode, {
            mods: [currentPick.modpool.toUpperCase()],
            map: dbMap?.mods || {},
            player: this.#opponentMods
         });
         await this.systemMessage(`Opponent scored ${this.#opponentTargetScore.toFixed()}`);
      };
      lobbyChannel.lobby.on("matchStarted", generateOpponentScore);
      this.once("closing", () => lobbyChannel.lobby.off("matchStarted", generateOpponentScore));

      return lobbyChannel.lobby;
   }

   protected override async _fetchMappool(): Promise<Mappool | undefined> {
      const mode = this._maniamode || this.mode;

      try {
         const response = await fetch(
            `${process.env.INTERNAL_URL}/api/db/mappool?r=${this.#playerRating.rating}&rd=${this.#playerRating.rd}&m=${mode}`
         );

         if (!response.ok) {
            throw new Error(`Mappool request failed: ${response.status}`);
         }

         const mappool = (await response.json()) as Mappool;
         console.log(mappool);
         return mappool;
      } catch (err) {
         console.warn("Failed to fetch mappool", err);
      }
   }

   protected _getPlayerIds(): number[] {
      return [this.#player.id];
   }
   protected _getPlayerName(index: number): string {
      if (index === 0) return this.#player.username;
      else return "AI Opponent";
   }
   protected _allPlayersPresent(): boolean {
      const playersInLobby = this.lobby.slots.filter(p => p);
      return playersInLobby.some(lobbyPlayer => lobbyPlayer?.user.id === this.#player.id);
   }
   protected async _inviteAll() {
      await this.invitePlayer(this.#player);
   }

   protected async _onPlayerLeft(player: BanchoLobbyPlayer): Promise<void> {
      // Give the player some time to rejoin
      await this.systemMessage("!mp timer 150 - Player left lobby");

      const handleLobbyAbandoned = () => {
         // Close the lobby
         this.closeLobby();
      };
      const handlePlayerRejoined = async ({ player: joiner }: { player: BanchoLobbyPlayer }) => {
         if (player.user.id !== joiner.user.id) {
            // Kick unauthorized players
            await this.lobby.kickPlayer(joiner.user.username);
            await this.lobby.setSize(1);
            return;
         }
         // Abandoning player has rejoined
         this.lobby.abortTimer();
         this.lobby.removeListener("timerEnded", handleLobbyAbandoned);
         this.lobby.removeListener("playerJoined", handlePlayerRejoined);
      };

      this.lobby.once("timerEnded", handleLobbyAbandoned);
      this.lobby.on("playerJoined", handlePlayerRejoined);
   }

   protected _calculateWinner(scores: BanchoLobbyPlayerScore[]): number {
      // The target score should have been generated when the map started
      return scores[0].score > this.#opponentTargetScore ? 0 : 1;
   }

   protected async _onLobbyMessage(msg: BanchoMessage): Promise<void> {
      if (msg.message.startsWith("!")) {
         const command = msg.message.split(" ");

         if (["!lobby", "!match", "!info"].includes(command[0])) {
            await this._printLobbyInfo();
            return;
         }
      } else if (
         msg.user.id === this.#player.id &&
         this._getActivePlayerIndex() === 0 &&
         msg.message.match(/^(?:nm|hd|hr|dt|fm)[0-4]$/i)
      ) {
         const command = msg.message.split(" ");
         await this._handlePickBan(command[0]);
      } else if (this._getActivePlayerIndex() === 1 && msg.message.match(/^Available maps: /)) {
         console.log("message", msg.message);
         console.log("self", msg.self);
         console.log("isClient", msg.user.isClient());
         // Pick a map at random
         const availableMaps = msg.message.substring("Available maps: ".length).split(", ");
         const chosenMap = availableMaps[(Math.random() * availableMaps.length) | 0];
         await this.systemMessage(chosenMap);
         await this._handlePickBan(chosenMap);
      }
   }

   hasPlayer(player: BanchoUser): boolean {
      return this.#player.id === player.id;
   }
}
