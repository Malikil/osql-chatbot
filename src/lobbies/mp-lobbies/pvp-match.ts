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

import { GameMode } from "../../types/global";
import { MMPlayerObj } from "../../types/matchmaking";
import MpLobbyBase from "./mp-lobby-base";

export default class PvPLobbyRef extends MpLobbyBase {
   #players: MMPlayerObj[];

   constructor(
      players: MMPlayerObj[],
      bancho: BanchoClient,
      mode: GameMode = "osu",
      variant?: "4k" | "7k"
   ) {
      super(bancho, mode, 7, variant);
      this.#players = players;
   }

   protected async _createLobby(): Promise<BanchoLobby> {
      const lobbyChannel = await this._bancho.createLobby(
         `MPSQ: ${this.#players[0].bancho.username} (${this.#players[0].rating.rating.toFixed()}) vs ${
            this.#players[1].bancho.username
         } (${this.#players[1].rating.rating.toFixed()}) - ${Date.now()}`
      );

      await lobbyChannel.lobby.setSettings(
         BanchoLobbyTeamModes.HeadToHead,
         BanchoLobbyWinConditions.ScoreV2,
         2
      );

      return lobbyChannel.lobby;
   }

   protected _getPlayerIds(): number[] {
      return this.#players.map(p => p.bancho.id);
   }
   protected _getPlayerName(index: number): string {
      return this.#players[index]?.bancho.username;
   }
   protected _allPlayersPresent(): boolean {
      const playersInLobby = this.lobby.slots.filter(p => p);
      return this.#players.every(requiredPlayer =>
         playersInLobby.some(lobbyPlayer => requiredPlayer.bancho.id === lobbyPlayer?.user.id)
      );
   }
   protected async _inviteAll() {
      await Promise.all(this.#players.map(p => this.invitePlayer(p.bancho)));
   }

   protected async _onPlayerLeft(player: BanchoLobbyPlayer): Promise<void> {
      // If there are no players left, just close the lobby.
      if (this.lobby.slots.every(p => !p)) {
         await this.closeLobby();
         return;
      }

      await this.systemMessage("!mp timer 150 - Player left lobby");

      const handleLobbyAbandoned = () => {
         // Get the remaining player
         const remainingPlayers = this.lobby.slots
            .filter(p => p)
            .filter(lobbyPlayer =>
               this.#players.find(
                  requiredPlayer => lobbyPlayer?.user.id === requiredPlayer.bancho.id
               )
            );
         if (remainingPlayers.length < 1) return this.closeLobby();
         this._finishByDefault(remainingPlayers[0]!.user.id);
      };
      const handlePlayerRejoined = ({ player: joiner }: { player: BanchoLobbyPlayer }) => {
         if (player.user.id !== joiner.user.id) return;
         // Abandoning player has rejoined
         this.lobby.abortTimer();
         this.lobby.removeListener("timerEnded", handleLobbyAbandoned);
         this.lobby.removeListener("playerJoined", handlePlayerRejoined);
      };

      this.lobby.once("timerEnded", handleLobbyAbandoned);
      this.lobby.on("playerJoined", handlePlayerRejoined);
   }

   protected _calculateWinner(scores: BanchoLobbyPlayerScore[]): number {
      // Scores appear to be sorted in descending order.
      const winnerIndex = this.#players.findIndex(p => p.bancho.id === scores[0].player.user.id);
      return winnerIndex;
   }

   protected async _onLobbyMessage(msg: BanchoMessage): Promise<void> {
      if (msg.message.startsWith("!")) {
         const command = msg.message.split(" ");

         if (["!lobby", "!match", "!info"].includes(command[0])) {
            await this._printLobbyInfo();
            return;
         }
      } else if (
         msg.user.id === this.#players[this._getActivePlayerIndex()].bancho.id &&
         msg.message.match(/^(?:nm|hd|hr|dt|fm)[0-4]$/i)
      ) {
         const command = msg.message.split(" ");
         await this._handlePickBan(command[0]);
      }
   }

   hasPlayer(player: BanchoUser): boolean {
      return !!this.#players.find(p => p.bancho.id === player.id);
   }
}
