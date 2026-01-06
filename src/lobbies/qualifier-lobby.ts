import {
   BanchoLobby,
   BanchoLobbyTeamModes,
   BanchoLobbyWinConditions,
   BanchoLobbyPlayer,
   BanchoUser,
   BanchoLobbyPlayerScore,
   BanchoMod,
   BanchoMods
} from "bancho.js";
import { Mode } from "nodesu";
import { GameMode } from "../types/global";
import { mapsDb } from "../db/connection";
import LobbyBase from "./lobby-base";

class QualifierLobby extends LobbyBase {
   #player;
   #maplist: { map: number; mods: BanchoMod[]; freemod?: boolean }[];
   #shuffle: boolean;

   constructor(player: BanchoUser, mode: GameMode = "osu") {
      super(player.banchojs, mode);
      console.log("Set up quali ref instance");
      this.#player = player;
      this.#maplist = [];
      this.#shuffle = false;
   }

   override async setupFromArgs(args: string[]): Promise<void> {
      // Figure out the maplist
      let mods: BanchoMod[] = [];
      let freemod = false;
      for (let nextArg = args.shift() || ""; nextArg; nextArg = args.shift() || "") {
         const id = parseInt(nextArg);
         if (id)
            this.#maplist.push({
               map: id,
               mods,
               freemod
            });
         else if (nextArg === "shuffle") this.#shuffle = true;
         else {
            mods = BanchoMods.parseShortMods(nextArg);
            freemod = nextArg.toLowerCase().includes("fm");
         }
      }
   }

   protected async _createLobby(): Promise<BanchoLobby> {
      const channel = await this._bancho.createLobby(
         `Maplist for ${this.#player.username} - ${Date.now()}`
      );
      return channel.lobby;
   }
   protected override async _startMatch() {
      // Create the lobby
      await this.lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         8
      );
      await this.invitePlayer(this.#player);
   }

   protected async _onPlayerJoined({
      player
   }: {
      player: BanchoLobbyPlayer;
      slot: number;
      team: string;
   }): Promise<void> {
      if (player.user.username === this.#player.username) {
         console.log(`${this.lobby.id} - Player joined`);
         this.#nextSong();
      }
   }

   protected async _onPlayerLeft(player: BanchoLobbyPlayer): Promise<void> {
      const lobbyid = this.lobby.id;
      // If there's nobody left in the lobby, end the lobby
      if (this.lobby.slots.filter(u => u).length < 2) {
         // Make sure there hasn't been a desync
         await this.lobby.updateSettings();
         if (this.lobby.slots.filter(u => u).length > 0) return;

         this.lobby.channel.sendMessage("All players left. Lobby will close");
         this.emit("finished", lobbyid);
         this.closeLobby(5000);
      }
   }

   protected async _onSongFinished(scores: BanchoLobbyPlayerScore[]): Promise<void> {
      if (this.#maplist.length > 0) this.#nextSong();
      else this.#matchCompleted();
   }

   async #nextSong() {
      // Get the next map/mod
      let nextIndex = 0;
      if (this.#shuffle) nextIndex = (this.#maplist.length * Math.random()) | 0;
      const nextMap = this.#maplist.splice(nextIndex, 1)[0];
      const shortMods = nextMap.mods.map(m => m.shortMod.toUpperCase());
      // Look up the map in the db
      const dbMap = await mapsDb[this.mode].findOne({ _id: nextMap.map });
      if (dbMap) {
         const rating = dbMap.rating.rating;
         const modMult = shortMods.reduce((mult, mod) => mult * (dbMap.mods[mod] || 1), 1);
         this.lobby.channel.sendMessage(
            `${dbMap.title} +${
               shortMods.join("") || "NM"
            } - Rating: ${rating.toFixed()} x${modMult.toFixed(2)} (${(
               rating * modMult
            ).toFixed()})`
         );
      } else
         this.lobby.channel.sendMessage(
            `${nextMap.map} +${shortMods.join("") || "NM"} - Rating: Unknown`
         );
      // Set the map and update the next rating range
      await this.lobby.setMap(nextMap.map, Mode[this.mode === "fruits" ? "ctb" : this.mode]);
      await this.lobby.setMods(
         "nf " + shortMods.join(" "),
         nextMap.freemod ||
            this.mode === "mania" ||
            (this.mode === "fruits" && shortMods.some(mod => mod === "HR" || mod === "DT"))
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

export default QualifierLobby;
