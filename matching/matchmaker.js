const { BanchoUser } = require("bancho.js");

/**
 * @param {import("../types/matchmaking").QueuedPlayer} p1
 * @param {import("../types/matchmaking").QueuedPlayer} p2
 */
const withinRange = (p1, p2 = {}) => {
   const diff = Math.abs(p1.rating - p2.rating);
   const range = p1.range + p2.range;
   return diff <= range;
};

class Matchmaker {
   /** @type {import("../types/matchmaking").QueuedPlayer[]} */
   #playerQueue;
   #options;
   #queueTimerId;
   #createLobby;
   /** @type {import("../types/matchmaking").PendingLobby[]} */
   #pendingLobbies;

   /**
    * @param {function(import("../types/matchmaking").MMPlayerObj[])} createLobby
    * @param {object} options
    * @param {number} options.searchInterval How often to attempt to create matches
    * @param {number} options.searchRangeIncrement How much should the rating range increase per matching attempt
    */
   constructor(createLobby, options = {}) {
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
      this.#createLobby = createLobby;
   }

   #attemptCreateMatches() {
      /** @type {import("../types/matchmaking").QueuedPlayer[][]} */
      const lobbies = [];
      this.#playerQueue = this.#playerQueue
         .filter((player, i, arr) => {
            // If the player is already in a lobby, skip them
            if (lobbies.find(l => l.find(p => p.id === player.id))) return false;

            // Should the player be matched?
            if (withinRange(player, arr[i + 1])) lobbies.push([player, arr[i + 1]]);
            // True means they are still waiting in queue
            else return true;
         })
         .map(p => ({
            // Leftover players should have their search range increased
            ...p,
            range: p.range + this.#options.searchRangeIncrement
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
            waitTimer: setTimeout(() => {
               pending.players.forEach(p => {
                  if (p.ready) {
                     p.player.bancho.sendMessage("Lobby expired. Rejoining queue");
                     const prevTargetRange = lobby.find(qp => qp.player.bancho.id === p.player.bancho.id);
                     if (!prevTargetRange) this.searchForMatch(p.player);
                     else {
                        this.#playerQueue.push(prevTargetRange);
                        this.#playerQueue.sort((a, b) => a.rating - b.rating);
                     }
                  } else p.player.bancho.sendMessage("Lobby expired");
               });
               const pendIndex = this.#pendingLobbies.findIndex(l => l === pending);
               this.#pendingLobbies.splice(pendIndex, 1);
            }, 60000)
         };
         this.#pendingLobbies.push(pending);
      });
   }

   /**
    * @param {import("../types/matchmaking").MMPlayerObj} player
    */
   searchForMatch(player) {
      console.log(`Add ${player.bancho.username} to queue`);
      if (this.#playerQueue.find(p => p.player.bancho.id === player.bancho.id)) {
         console.log("Player already in queue");
         player.bancho.sendMessage("You are already queued!");
         return;
      }
      this.#playerQueue.push({
         player,
         rating: player.rating.rating,
         range: player.rating.rd
      });
      this.#playerQueue.sort((a, b) => a.rating - b.rating);
      console.log(this.#playerQueue);
   }

   /**
    * @param {BanchoUser} player
    */
   unqueue(player) {
      console.log(`Remove ${player.username} from queue`);
      const playerIndex = this.#playerQueue.findIndex(p => p.player.bancho.id === player.id);
      if (playerIndex >= 0) this.#playerQueue.splice(playerIndex, 1);
   }

   /**
    * @param {BanchoUser} player
    */
   async playerReady(player) {
      const lobby = this.#pendingLobbies.find(l =>
         l.players.find(p => p.player.bancho.id === player.id)
      );
      if (!lobby) return;

      const lobbyPlayer = lobby.players.find(p => p.player.bancho.id === player.id);
      lobbyPlayer.ready = true;
      if (lobby.players.every(p => p.ready)) {
         clearTimeout(lobby.waitTimer);
         this.#createLobby(lobby.players.map(p => p.player));
      } else player.sendMessage("Waiting for opponent");
   }

   end() {
      clearInterval(this.#queueTimerId);
   }
}

module.exports = Matchmaker;
