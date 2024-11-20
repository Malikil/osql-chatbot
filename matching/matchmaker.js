/**
 * @param {import("../types/matchmaking").Player} p1
 * @param {import("../types/matchmaking").Player} p2
 */
const withinRange = (p1, p2 = {}) => {
   const diff = Math.abs(p1.rating - p2.rating);
   const range = p1.range + p2.range;
   return diff <= range;
};

class Matchmaker {
   #playerQueue;
   #options;
   #queueTimerId;
   #createLobby;
   /**
    * @param {function(import("../types/matchmaking").Player[])} createLobby
    * @param {object} options
    * @param {number} options.searchInterval How often to attempt to create matches
    * @param {number} options.searchRangeIncrement How much should the rating range increase per matching attempt
    */
   constructor(createLobby, options = {}) {
      /** @type {import("../types/matchmaking").Player[]} */
      this.#playerQueue = [];
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
      /** @type {import("../types/matchmaking").Player[][]} */
      const lobbies = [];
      this.#playerQueue = this.#playerQueue
         .filter((player, i, arr) => {
            // If the player is already in a lobby, skip them
            if (lobbies.find(l => l.find(p => p.id === player.id))) return false;

            // Should the player be matched?
            if (withinRange(player, arr[i + 1])) lobbies.push([player, arr[i + 1]]);
            else return true;
         })
         .map(p => ({
            // Leftover players should have their search range increased
            ...p,
            range: p.range + this.#options.searchRangeIncrement
         }));
      lobbies.forEach(this.#createLobby);
   }

   /**
    * @param {import("../types/matchmaking").Player} player
    */
   searchForMatch(player) {
      console.log(`Add ${player.player.bancho.username} to queue`);
      this.#playerQueue.push(player);
      this.#playerQueue.sort((a, b) => a.rating - b.rating);
      console.log(this.#playerQueue);
   }
}

module.exports = Matchmaker;
