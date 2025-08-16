import { PrivateMessage } from "bancho.js";
import LobbyManager from "../matching/lobby-manager";
import PveManager from "../song-rush/lobby-manager";
import Matchmaker from "../matching/matchmaker";
import { BanchoCommand } from "../types/commands";
import pvp from "./pvp";
import { songRushLobby } from "./song-rush";
import { countActiveLobbies, countQueuedPlayers } from "./admin";

export function init(matchmaker: Matchmaker, lobbyManager: LobbyManager, pveManager: PveManager) {
   const commands: [string, any][] = [
      ["queue", pvp.queue],
      ["q", pvp.queue],
      ["unq", pvp.unqueue],
      ["unqueue", pvp.unqueue],
      ["ready", pvp.ready],
      ["r", pvp.ready],
      ["invite", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["reinvite", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["lobby", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["pve", (msg: PrivateMessage) => songRushLobby(msg, pveManager)],
      [
         "counts",
         (msg: PrivateMessage) => {
            countActiveLobbies(msg, lobbyManager);
            countQueuedPlayers(msg, matchmaker);
         }
      ]
   ];
   commands.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
   const commandList = "Commands list: info, q, unq, lobby, pve";
   return {
      commands: msg => msg.user.sendMessage(commandList),
      info: msg => msg.user.sendMessage(commandList),
      ...Object.fromEntries(commands.map(com => [com[0], msg => com[1](msg, matchmaker)]))
   } as { [command: string]: BanchoCommand };
}
