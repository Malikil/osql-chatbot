import { MatchmakerEvents, MMPlayerObj, PendingLobby, QueuedPlayer } from "../types/matchmaking";
import { BanchoUser } from "bancho.js";
import EventEmitter from "node:events";

const withinRange = (p1: QueuedPlayer, p2: QueuedPlayer | null) => {
   if (!p2 || p1.mode !== p2.mode) return false;
   if (p1.mode === "mania" && p1.variant && p2.variant && p1.variant !== p2.variant) return false;
   const diff = Math.abs(p1.rating - p2.rating);
   return p1.range > diff && p2.range > diff;
};

class Matchmaker extends EventEmitter<MatchmakerEvents> {
   #playerQueue: QueuedPlayer[];
   #options;
   #queueTimerId;
   #pendingLobbies: PendingLobby[];

   /**
    * @param {object} options
    * @param {number} [options.searchInterval] How often to attempt to create matches
    * @param {number | function(import("../types/matchmaking").QueuedPlayer): number} [options.searchRangeIncrement]
    * How much should the rating range increase per matching attempt. A number argument will increase
    * by a flat amount. Or pass a function which returns the new search range value.
    */
   constructor(options: {
      searchInterval?: number;
      searchRangeIncrement?: number | ((p: QueuedPlayer) => number)
   } = {}) {
      super();
      this.#playerQueue = [];
      this.#pendingLobbies = [];
      this.#options = {
         searchInterval: 2000,
         searchRangeIncrement: 0.1,
         ...options
      };
      this.#queueTimerId = setInterval(
         this.#attemptCreateMatches.bind(this),
         this.#options.searchInterval
      );
   }

   #attemptCreateMatches() {
      const lobbies: QueuedPlayer[][] = [];
      this.#playerQueue = this.#playerQueue
         .filter((player, iPlayer, arr) => {
            // If the player is already in a lobby, skip them
            if (lobbies.find(l => l.find(p => p.player.bancho.id === player.player.bancho.id))) return false;

            // Should the player be matched?
            // Look for players later in the array (to avoid attempting to match the same player twice)
            // who meet matching criteria
            const opponent = arr.find(
               (candidate, iCand) => iCand > iPlayer && withinRange(player, candidate)
            );
            if (opponent) lobbies.push([player, opponent]);
            // True means they are still waiting in queue
            else return true;
         })
         .map(p => ({
            // Leftover players should have their search range increased
            ...p,
            range:
               typeof this.#options.searchRangeIncrement === "number"
                  ? p.range + this.#options.searchRangeIncrement
                  : this.#options.searchRangeIncrement(p)
         }));
      lobbies.forEach(lobby => {
         const pending = {
            players: lobby.map(p => {
               p.player.bancho.sendMessage("Match found! Type !ready to accept");
               return {
                  player: p.player,
                  ready: false
               };
            }),
            mode: lobby[0].mode,
            variant: lobby[0].variant || lobby[1].variant,
            waitTimer: setTimeout(() => {
               pending.players.forEach(p => {
                  if (p.ready) {
                     p.player.bancho.sendMessage("Lobby expired. Rejoining queue");
                     const prevTargetRange = lobby.find(
                        qp => qp.player.bancho.id === p.player.bancho.id
                     );
                     if (!prevTargetRange) this.searchForMatch(p.player);
                     else {
                        console.log(`Add ${prevTargetRange.player.bancho.username} to queue`);
                        this.#playerQueue.push(prevTargetRange);
                        console.log(this.#playerQueue);
                     }
                  } else p.player.bancho.sendMessage("Lobby expired");
               });
               const pendIndex = this.#pendingLobbies.findIndex(l => l === pending);
               this.#pendingLobbies.splice(pendIndex, 1);
            }, 60000)
         };
         console.log("Found lobby", pending);
         this.#pendingLobbies.push(pending);
      });
   }

   searchForMatch(player: MMPlayerObj) {
      console.log(`Add ${player.bancho.username} to queue`);
      if (this.#playerQueue.find(p => p.player.bancho.id === player.bancho.id)) {
         console.log("Player already in queue");
         player.bancho.sendMessage("You are already queued!");
         return;
      }
      this.#playerQueue.push({
         player,
         rating: player.rating.rating,
         range: player.rating.rd,
         mode: player.mode,
         variant: player.variant
      });
      console.log(this.#playerQueue);
   }

   unqueue(player: BanchoUser) {
      console.log(`Remove ${player.username} from queue`);
      const playerIndex = this.#playerQueue.findIndex(p => p.player.bancho.id === player.id);
      if (playerIndex >= 0) {
         this.#playerQueue.splice(playerIndex, 1);
         player.sendMessage("Removed from queue");
      }
   }

   async playerReady(player: BanchoUser) {
      const lobbyIndex = this.#pendingLobbies.findIndex(l =>
         l.players.some(p => p.player.bancho.id === player.id)
      );
      if (lobbyIndex < 0) return player.sendMessage("No lobby found");
      const lobby = this.#pendingLobbies[lobbyIndex];

      const lobbyPlayer = lobby.players.find(p => p.player.bancho.id === player.id)!;
      lobbyPlayer.ready = true;
      if (lobby.players.every(p => p.ready)) {
         clearTimeout(lobby.waitTimer);
         this.#pendingLobbies.splice(lobbyIndex, 1);
         this.emit(
            "match",
            lobby.players.map(p => p.player),
            lobby.mode,
            lobby.variant
         );
      } else player.sendMessage("Waiting for opponent");
   }

   end() {
      clearInterval(this.#queueTimerId);
   }

   playersInQueue() {
      return this.#playerQueue.length;
   }
}

export default Matchmaker;
