import { BanchoClient, BanchoMessage, BanchoUser } from "bancho.js";
import LobbyBase from "./lobby-base";
import { GameMode } from "../types/global";
import SongRushLobby from "./song-rush-lobby";
import AutoLobby from "./auto-lobby";
import QualifierLobby from "./qualifier-lobby";
import { MMPlayerObj } from "../types/matchmaking";
import PvPLobbyRef from "./mp-lobbies/pvp-match";
import { LobbyResult } from "../types/lobby";
import PvELobbyRef from "./mp-lobbies/pve-match";

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
         case "lives":
            lobby = new SongRushLobby(msg.user, mode);
            break;
         case "auto":
            lobby = new AutoLobby(msg.user, mode);
            break;
         case "quali":
            lobby = new QualifierLobby(msg.user, mode);
            break;
         case "pve":
            // case "test":
            lobby = new PvELobbyRef(msg.user, mode);
            break;
         default:
            return;
      }
      if (maniamode) lobby.setManiaMode(maniamode);
      const handleClose = (mp: number) => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         if (i >= 0) this.#activeLobbies.splice(i, 1);
         fetch(`${process.env.INTERNAL_URL}/api/db/pve`, {
            method: "POST",
            body: JSON.stringify({ mp }),
            headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
         }).then(() => console.log("Results submitted"));
      };
      lobby.once("closed", handleClose);
      this.#activeLobbies.push(lobby);
      try {
         await lobby.setupFromArgs(args);
         await lobby.startMatch();
      } catch (err) {
         console.error(err);
         lobby.closeLobby().catch(err2 => {
            console.warn("Close failed lobby error", err2);
            lobby.off("closed", handleClose);
            // Remove failed lobby from list
            const i = this.#activeLobbies.findIndex(l => l === lobby);
            if (i >= 0) this.#activeLobbies.splice(i, 1);
         });
      }
   }

   async createMatch(
      players: MMPlayerObj[],
      mode: GameMode,
      variant: "4k" | "7k" | undefined = undefined
   ) {
      console.log("Create match with players", players);
      const lobby = new PvPLobbyRef(players, this.#bancho, mode, variant);
      const handleFinished = (result: LobbyResult) => {
         // Submit results to pvp endpoint
         fetch(`${process.env.INTERNAL_URL}/api/db/pvp`, {
            method: "POST",
            body: JSON.stringify({
               mp: result.mp,
               defaultWinner: result.defaultWinner
            }),
            headers: [["Authorization", process.env.MATCH_SUBMIT_AUTH || ""]]
         }).then(() => console.log("PvP result submitted"));
         lobby.off("finished", handleFinished);
      };
      const handleClose = () => {
         const i = this.#activeLobbies.findIndex(l => l === lobby);
         if (i >= 0) this.#activeLobbies.splice(i, 1);
         lobby.off("closed", handleClose);
      };
      lobby.once("finished", handleFinished);
      lobby.once("closed", handleClose);
      this.#activeLobbies.push(lobby);
      try {
         await lobby.startMatch();
      } catch (err) {
         console.error(err);
         lobby.closeLobby().catch(err2 => {
            console.warn("Close failed lobby error", err2);
            // Remove failed lobby from list and remove listener
            handleClose();
         });
         lobby.off("finished", handleFinished);
      }
   }

   reinvite(player: BanchoUser) {
      const lobby = this.#activeLobbies.find(l => l.hasPlayer(player));
      if (lobby) {
         lobby.invitePlayer(player);
         return true;
      } else return false;
   }

   async terminateLobbies() {
      await Promise.all(
         this.#activeLobbies.map(async lobby => {
            await lobby.systemMessage("Process shutdown. All active lobbies have been abandoned.");
            await lobby.closeLobby(1000);
         })
      );
   }

   lobbyCount() {
      return this.#activeLobbies.length;
   }
}

export default LobbyManager;
