import { BanchoClient, BanchoLobby, BanchoLobbyPlayer, BanchoLobbyPlayerScore, BanchoMessage, BanchoUser } from "bancho.js";
import EventEmitter from "node:events";
import { GameMode } from "../types/global";

export default abstract class LobbyBase extends EventEmitter<{
   finished: [mp: number];
   closing: [mp: number];
   closed: [mp: number];
}> {
   protected _bancho;
   #lobby?: BanchoLobby;
   readonly mode;
   protected _maniamode?: "4k" | "7k";
   #interruptHandler;

   constructor(bancho: BanchoClient, mode: GameMode) {
      super();
      this._bancho = bancho;
      this.mode = mode;

      this.#interruptHandler = () => {
         this.#lobby?.channel.sendMessage(
            "SIGTERM - Process killed. All active lobbies have been abandoned."
         );
         this.closeLobby();
      };
   }

   async setupFromArgs(args: string[]) {};

   protected get lobby(): BanchoLobby {
      if (!this.#lobby) throw new Error('Lobby not initialized');
      return this.#lobby;
   }

   setManiaMode(mode: "4k" | "7k") {
      this._maniamode = mode;
   }

   async startMatch() {
      // There must be a cleaner way to close lobbies when the program is trying to exit than
      // watching for the event here
      process.on("SIGTERM", this.#interruptHandler);
      this.#lobby = await this._createLobby();
      console.log(`Created ${this.mode} lobby: ${this.#lobby.channel.name}`);
      // Set up lobby listeners
      this.#lobby.channel.on('message', this.#lobbyMessageHandler);
      this.#lobby.on("allPlayersReady", this.#playersReadyHandler);
      this.#lobby.on('playerJoined', this.#playerJoinedHandler);
      this.#lobby.on('playerLeft', this.#playerLeftHandler);
      // Bug in banchojs type definitions -- scores are passed to handler as intended in real implementation
      this.#lobby.on('matchFinished', this.#songFinishedHandler as () => Promise<void>);

      // Do subclass specific setup
      await this._startMatch();
   }
   protected abstract _createLobby(): Promise<BanchoLobby>;
   protected async _startMatch(): Promise<void> {};

   #playerJoinedHandler = async (info: { player: BanchoLobbyPlayer, slot: number, team: string }) => {
      console.log(this.lobby.id, `${info.player.user.ircUsername} joined the lobby`);
      this._onPlayerJoined(info)
   }
   protected async _onPlayerJoined(info: { player: BanchoLobbyPlayer, slot: number, team: string }) {};

   #playerLeftHandler = async (player: BanchoLobbyPlayer) => {
      console.log(this.lobby.id, `${player.user.ircUsername} left the lobby`);
      this._onPlayerLeft(player);
   }
   protected async _onPlayerLeft(player: BanchoLobbyPlayer) {};

   #playersReadyHandler = async () => {
      await this._onPlayersReady();
   }
   /** Default: Start match after 5 seconds */
   protected async _onPlayersReady() {
      this.lobby.startMatch(5);
   };

   #songFinishedHandler = async (scores: BanchoLobbyPlayerScore[]) => {
      await this._onSongFinished(scores);
   }
   protected async _onSongFinished(scores: BanchoLobbyPlayerScore[]) {};

   #lobbyMessageHandler = async (msg: BanchoMessage) => {
      await this._onLobbyMessage(msg);
   }
   protected async _onLobbyMessage(msg: BanchoMessage) {}

   /** Can be overridden in a subclass to return whether the player should be a participant in the lobby */
   hasPlayer(player: BanchoUser): boolean {
      return false;
   }
   async invitePlayer(player: BanchoUser) {
      console.log(this.lobby.id, "Invite player", player.username);
      return this.lobby.invitePlayer(`#${player.id}`);
   }
      
   async closeLobby(delay: number = 0) {
      const mp = this.lobby.id || 0;
      this.emit('closing', mp);
      process.off("SIGTERM", this.#interruptHandler);
      try {
         if (!this.#lobby) throw new Error('No lobby exists for cleanup');
         this.#lobby.channel.off('message', this.#lobbyMessageHandler);
         this.#lobby.off("allPlayersReady", this.#playersReadyHandler);
         this.#lobby.off('playerJoined', this.#playerJoinedHandler);
         this.#lobby.off('playerLeft', this.#playerLeftHandler);
         this.#lobby.off('matchFinished', this.#songFinishedHandler);
      } catch (err) {
         console.warn("Couldn't clean up properly");
         console.warn(err);
      } finally {
         setTimeout(async () => {
            await this.lobby.closeLobby().catch(err => console.warn(err));
            this.emit('closed', mp);
         }, delay);
      }
   }
}
