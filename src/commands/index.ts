import { PrivateMessage } from "bancho.js";
import LobbyManager from "../lobbies/lobby-manager";
import Matchmaker from "../matching/matchmaker";
import { BanchoCommand } from "../types/commands";
import pvp from "./pvp";
import { countActiveLobbies, countQueuedPlayers } from "./admin";

export function init(matchmaker: Matchmaker, lobbyManager: LobbyManager) {
   const commands: [string, any][] = [
      ["auto", lobbyManager.createLobby],
      ["queue", pvp.queue],
      ["q", pvp.queue],
      ["unq", pvp.unqueue],
      ["unqueue", pvp.unqueue],
      ["ready", pvp.ready],
      ["r", pvp.ready],
      ["invite", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["reinvite", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["lobby", (msg: PrivateMessage) => lobbyManager.reinvite(msg.user)],
      ["lives", lobbyManager.createLobby],
      [
         "counts",
         (msg: PrivateMessage) => {
            countActiveLobbies(msg, lobbyManager);
            countQueuedPlayers(msg, matchmaker);
         }
      ],
      ["quali", lobbyManager.createLobby],
      ["pve", lobbyManager.createLobby]
      // ["test", lobbyManager.createLobby]
   ];
   commands.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
   const infoText = `View info, rules, and commands [${process.env.INTERNAL_URL} Here]`;
   return {
      commands: msg => msg.user.sendMessage(infoText),
      info: msg => msg.user.sendMessage(infoText),
      ...Object.fromEntries(commands.map(com => [com[0], msg => com[1](msg, matchmaker)]))
   } as { [command: string]: BanchoCommand };
}
