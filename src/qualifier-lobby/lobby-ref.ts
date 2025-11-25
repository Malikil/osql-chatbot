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
import { GameMode, ModPool } from "../types/global";
import { mapsDb } from "../db/connection";

class LobbyRef extends EventEmitter<{
   finished: [
      mp: number,
      lobbyState: {
         player: number;
         mode: GameMode;
      }
   ];
   closed: [mp: number];
}> {
   #bancho;
   #lobby?: BanchoLobby;
   #mode;
   #player;
   #interruptHandler;
   #maplist: { map: number; mod: ModPool }[];
   #shuffle: boolean;

   constructor(player: BanchoUser, bancho: BanchoClient, mode: GameMode = "osu") {
      super();
      console.log("Set up quali ref instance");
      this.#bancho = bancho;
      this.#mode = mode;
      this.#player = player;
      this.#maplist = [];
      this.#shuffle = false;
      this.#interruptHandler = () => {
         this.#lobby?.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      };
   }

   setMaplist(maps: { map: number; mod: ModPool }[], shuffle: boolean | undefined = undefined) {
      this.#maplist = maps;
      if (shuffle !== undefined)
         this.#shuffle = shuffle;
   }

   async startMatch() {
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("SIGTERM", this.#interruptHandler);
      // Create the lobby
      const mpChannel = await this.#bancho.createLobby(
         `Maplist for ${this.#player.username} - ${Date.now()}`
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
      // If there's nobody left in the lobby, end the lobby
      if (this.#lobby.slots.filter(u => u).length < 2) {
         // Make sure there hasn't been a desync
         await this.#lobby.updateSettings();
         if (this.#lobby.slots.filter(u => u).length > 0) return;

         this.#lobby.off("allPlayersReady", this.#playersReady);
         this.#lobby.channel.sendMessage("All players left. Lobby will close");
         await new Promise(resolve => setTimeout(resolve, 5000));
         this.emit("finished", lobbyid, {
            player: this.#player.id,
            mode: this.#mode
         });
         this.closeLobby();
      }
   }

   #handleLobbyMessage = async (msg: BanchoMessage) => {
      // Do nothing
   };

   #playersReady = async () => {
      this.#lobby?.startMatch(3);
   };

   #songFinished(scores: BanchoLobbyPlayerScore[]) {
      if (this.#maplist.length > 0) this.#nextSong();
      else this.#matchCompleted();
   }

   async #nextSong() {
      if (!this.#lobby) throw new Error("Next song but no lobby found");
      // Get the next map/mod
      let nextIndex = 0;
      if (this.#shuffle)
         nextIndex = (this.#maplist.length * Math.random()) | 0;
      const nextMap = this.#maplist.splice(nextIndex, 1)[0];
      // Look up the map in the db
      const dbMap = await mapsDb[this.#mode].findOne({ _id: nextMap.map });
      if (dbMap)
         this.#lobby.channel.sendMessage(
            `${
               dbMap.title
            } +${nextMap.mod.toUpperCase()} - Rating: ${dbMap.rating.rating.toFixed()} x${(
               dbMap.mods[nextMap.mod] || 1
            ).toFixed(2)} (${(dbMap.rating.rating * (dbMap.mods[nextMap.mod] || 1)).toFixed()})`
         );
      else
         this.#lobby.channel.sendMessage(
            `${nextMap.map} +${nextMap.mod.toUpperCase()} - Rating: Unknown`
         );
      // Set the map and update the next rating range
      await this.#lobby.setMap(nextMap.map, Mode[this.#mode === "fruits" ? "ctb" : this.#mode]);
      await this.#lobby.setMods(
         "nf " + nextMap.mod,
         nextMap.mod === "fm" || this.#mode === "mania"
      );
   }

   #matchCompleted = () => {
      if (!this.#lobby) throw new Error("Match finished but no lobby");
      this.#lobby.channel.sendMessage("Lobby finished - submitting result to server");
      this.#lobby.removeAllListeners("playerLeft");
      this.emit("finished", this.#lobby.id, {
         player: this.#player.id,
         mode: this.#mode
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
