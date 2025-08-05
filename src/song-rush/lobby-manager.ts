import { BanchoUser, BanchoClient } from "bancho.js";
import LobbyRef from "./lobby-ref";
import { GameMode } from "../types/global";

class LobbyManager {
   #activeLobbies: LobbyRef[];
   #bancho: BanchoClient;

   constructor(bancho: BanchoClient) {
      this.#activeLobbies = [];
      this.#bancho = bancho;
   }

   createLobby(player: BanchoUser, mode: GameMode = "osu") {
      console.log("Create score rush with player", player);
      const lobby = new LobbyRef(player, this.#bancho, mode);
      lobby.startMatch();
      this.#activeLobbies.push(lobby);
      const finished = () => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         this.#activeLobbies.splice(i, 1);
         lobby.off("closed", finished);
      };
      lobby.on("closed", finished);
   }

   reinvite(player: BanchoUser) {
      const lobby = this.#activeLobbies.find(l => l.hasPlayer(player));
      lobby?.invite(player);
   }
}

export default LobbyManager;
