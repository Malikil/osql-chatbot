import { BanchoClient, BanchoMessage, BanchoUser } from "bancho.js";
import LobbyBase from "./lobby-base";
import { GameMode } from "../types/global";
import SongRushLobby from "./song-rush-lobby";
import AutoLobby from "./auto-lobby";
import QualifierLobby from "./qualifier-lobby";

class LobbyManager {
   #activeLobbies: LobbyBase[];
   #bancho: BanchoClient;

   constructor(bancho: BanchoClient) {
      this.#activeLobbies = [];
      this.#bancho = bancho;

      // Bind methods
      this.createLobby = this.createLobby.bind(this);
      this.reinvite = this.reinvite.bind(this);
   }

   async createLobby(msg: BanchoMessage) {
      const [lobbyType, modeStr, ...args] = msg.content.slice(1).split(" ");
      // Figure out the gamemode
      let mode = modeStr as GameMode | "ctb";
      if (mode === "ctb") mode = "fruits";
      let maniamode = null;
      if (["4k", "7k"].includes(mode)) {
         maniamode = mode as "4k" | "7k";
         mode = "mania";
      }
      if (!["osu", "fruits", "taiko", "mania"].includes(mode)) mode = "osu";

      let lobby: LobbyBase;
      switch (lobbyType) {
         case "pve":
            lobby = new SongRushLobby(msg.user, mode);
            break;
         case 'auto':
            lobby = new AutoLobby(msg.user, mode);
            break;
         case 'quali':
            lobby = new QualifierLobby(msg.user, mode);
            break;
         default:
            return;
      }
      if (maniamode) lobby.setManiaMode(maniamode);
      this.#activeLobbies.push(lobby);
      lobby.once("closed", mp => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         this.#activeLobbies.splice(i, 1);
         fetch(`${process.env.INTERNAL_URL}/api/db/pve`, {
            method: "POST",
            body: JSON.stringify({ mp }),
            headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
         }).then(() => console.log("Results submitted"));
      });
      await lobby.setupFromArgs(args);
      await lobby.startMatch();
   }

   reinvite(player: BanchoUser) {
      const lobby = this.#activeLobbies.find(l => l.hasPlayer(player));
      if (lobby) {
         lobby.invitePlayer(player);
         return true;
      } else return false;
   }
}

export default LobbyManager;
