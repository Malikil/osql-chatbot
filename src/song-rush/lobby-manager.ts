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
      console.log("Create score rush with player", player.username);
      const lobby = new LobbyRef(player, this.#bancho, mode);
      lobby.startMatch();
      this.#activeLobbies.push(lobby);
      const finished = (mp: number) => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         this.#activeLobbies.splice(i, 1);
         lobby.off("closed", finished);
         lobby.removeAllListeners();
         fetch(`${process.env.INTERNAL_URL}/api/db/pve`, {
            method: "POST",
            body: JSON.stringify({ mp }),
            headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
         }).then(() => console.log("Results submitted"));
      };
      lobby.on("closed", finished);
      // const submit = (
      //    mp: number,
      //    { player, mode, lives }: { player: number; mode: GameMode; lives: number }
      // ) => {

      // };
      // lobby.once("paused", submit);
      // lobby.once("finished", submit);
   }

   reinvite(player: BanchoUser) {
      const lobby = this.#activeLobbies.find(l => l.hasPlayer(player));
      lobby?.invite(player);
   }
}

export default LobbyManager;
