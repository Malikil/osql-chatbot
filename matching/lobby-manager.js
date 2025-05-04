const { BanchoUser, BanchoClient } = require("bancho.js");

class LobbyManager {
    /** @type {LobbyManager[]} */
    #activeLobbies;
    /** @type {BanchoClient} */
    #bancho;

    /**
     * @param {BanchoClient} bancho 
     */
    constructor(bancho) {
        this.init(bancho);
    }

    init(bancho) {
        this.#activeLobbies = [];
        this.#bancho = bancho;
    }

    createLobby(players) {

    }

    /**
     * @param {BanchoUser} player 
     */
    reinvite(player) {

    }
}

module.exports = LobbyManager;