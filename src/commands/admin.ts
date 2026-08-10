import { PrivateMessage } from "bancho.js";
import LobbyManager from "../lobbies/lobby-manager";
import Matchmaker from "../matching/matchmaker";

export function countActiveLobbies(msg: PrivateMessage, lobbyManager: LobbyManager) {
   // At the moment, I am the only admin
   if (msg.user.username !== 'Malikil')
      return;

   msg.user.sendMessage(`Currently ${lobbyManager.lobbyCount()} active lobbies`);
}

export function countQueuedPlayers(msg: PrivateMessage, matchmaker: Matchmaker) {
   if (msg.user.username !== 'Malikil')
      return;

   msg.user.sendMessage(`Currently ${matchmaker.playersInQueue()} players in queue`);
}
