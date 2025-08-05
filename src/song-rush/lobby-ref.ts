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
   #nextRating;

   constructor(player: BanchoUser, bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#player = player;
      this.#nextRating = 0;
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
      // Invite player
      this.#lobby.invitePlayer(`#${this.#player.id}`);
   }

   async #playersJoined() {
      if (!this.#lobby) throw new Error('Players joined but no lobby found');
      console.log(`${this.#lobby.id} - All players joined`);
      // Set the initial map
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
      this.#nextRating = Math.min(
         minValues.minNm,
         minValues.minHd,
         minValues.minHr,
         minValues.minDt
      );
      // Get the map
      const candidateMaps = await mapsDb
         .find({
            $or: [
               { "ratings.nm.rating": { $gte: this.#nextRating, $lte: this.#nextRating + 100 } },
               { "ratings.hd.rating": { $gte: this.#nextRating, $lte: this.#nextRating + 100 } },
               { "ratings.hr.rating": { $gte: this.#nextRating, $lte: this.#nextRating + 100 } },
               { "ratings.dt.rating": { $gte: this.#nextRating, $lte: this.#nextRating + 100 } }
            ]
         })
         .toArray();
      const randMap = candidateMaps[(Math.random() * candidateMaps.length) | 0];
      const availableMods = (['nm', 'hd', 'hr', 'dt'] as SimpleMod[])
         .filter(mod => randMap.ratings[mod].rating >= this.#nextRating && randMap.ratings[mod].rating <= this.#nextRating + 100);
      const randMod = availableMods[(Math.random() * availableMods.length) | 0];
      // Set the map and update the next rating range
      await this.#lobby.setMap(randMap.id, Mode[this.#mode === 'fruits' ? 'ctb' : this.#mode]);
      await this.#lobby.setMods(randMod);
      this.#nextRating = randMap.ratings[randMod].rating;

      // Set up events for match gameplay
      this.#lobby.on('allPlayersReady', this.#playersReady.bind(this));
      this.#lobby.on('playerLeft', this.#playerLeft.bind(this));
      
   }

   async #playerLeft(player: BanchoLobbyPlayer) {}

   #handleLobbyCommand(msg: BanchoMessage) {}

   async #playersReady() {}

   /**
    * @param {BanchoLobbyPlayerScore[]} scores
    */
   #songFinished() {}

   #matchCompleted() {}

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
