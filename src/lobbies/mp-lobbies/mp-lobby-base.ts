import { BanchoClient, BanchoLobbyPlayer, BanchoLobbyPlayerScore, BanchoMods } from "bancho.js";
import LobbyBase from "../lobby-base";
import { GameMode, ModPool } from "../../types/global";
import { LobbyState, Mappool } from "../../types/lobby";
import { Mode } from "nodesu";

abstract class MpLobbyBase extends LobbyBase {
   readonly BO: number;
   #lobbyState: LobbyState;
   #mappool?: Mappool;
   #matchStarted: boolean;

   constructor(bancho: BanchoClient, mode: GameMode, bo: number, variant?: "4k" | "7k") {
      super(bancho, mode);
      this.BO = bo;
      if (variant) {
         this.setManiaMode(variant);
      }

      console.log("Set up ref instance");

      this.#lobbyState = {
         nextPlayer: 0,
         action: "ban",
         scores: [0, 0],
         bans: [],
         picks: [],
         activePick: { map: 0, modpool: "nm" }
      };
      this.#matchStarted = false;
   }

   protected abstract _getPlayerIds(): number[];
   protected abstract _getPlayerName(index: number): string;
   protected abstract _allPlayersPresent(): boolean;
   protected abstract _inviteAll(): Promise<void>;

   protected _getActivePlayerIndex() {
      return this.#lobbyState.nextPlayer;
   }
   protected _getActivePick() {
      return { ...this.#lobbyState.activePick };
   }

   protected async _startMatch(): Promise<void> {
      this.#mappool = await this._fetchMappool();
      // Allow subclass to invite players
      await this._inviteAll();
      // Set initial mod settings for mania
      if (this.mode === "mania") this.lobby.setMods("", true);
   }

   protected async _fetchMappool(): Promise<Mappool | undefined> {
      const playerParams = this._getPlayerIds().join("&p=");
      const mode = this._maniamode || this.mode;

      try {
         const response = await fetch(
            `${process.env.INTERNAL_URL}/api/db/mappool?p=${playerParams}&m=${mode}`
         );

         if (!response.ok) {
            throw new Error(`Mappool request failed: ${response.status}`);
         }

         const mappool = (await response.json()) as Mappool;
         console.log(mappool);
         return mappool;
      } catch (err) {
         console.warn("Failed to fetch mappool", err);
      }
   }

   protected async _onPlayerJoined(info: {
      player: BanchoLobbyPlayer;
      slot: number;
      team: string;
   }): Promise<void> {
      // Wait until both all players participating in the match have joined.
      if (this.#matchStarted || !this._allPlayersPresent()) return;

      this.#matchStarted = true;
      if (!this.#mappool) {
         await this.systemMessage("Pool failed to load, attempting refresh");

         this.#mappool = await this._fetchMappool();
         if (!this.#mappool) {
            await this.systemMessage("Fetch failed, lobby will close");
            console.warn("Failed to re-fetch pool");
            await this.closeLobby(3000);
            return;
         }
      }

      await this._printMappoolLink();
      await this._printPlayerPrompt();
   }

   protected async _printMappoolLink() {
      if (!this.#mappool) return;

      const nmUrl = this.#mappool.nm.join(",");
      const hdUrl = this.#mappool.hd.join(",");
      const hrUrl = this.#mappool.hr.join(",");
      const dtUrl = this.#mappool.dt.join(",");
      const fmUrl = this.#mappool.fm.join(",");
      const lUrl = encodeURIComponent(this.lobby.name);

      const searchParams =
         `m=${this.mode}&nm=${nmUrl}&hd=${hdUrl}&hr=${hrUrl}&dt=${dtUrl}&fm=${fmUrl}` +
         `&l=${lUrl}`;

      await this.systemMessage(
         `Mappool can be found here: ` +
            `[${process.env.MAPPOOL_URL}/mappool/lobby?${searchParams} Mappool]`
      );
   }
   protected async _printPlayerPrompt() {
      if (this.#lobbyState.action === "ban" || this.#lobbyState.action === "tbban")
         await this.systemMessage(
            `Ban ${this.#lobbyState.bans.length + 1}: ${this._getPlayerName(this.#lobbyState.nextPlayer)}`
         );
      else if (this.#lobbyState.action === "pick" || this.#lobbyState.action === "tb")
         await this.systemMessage(
            `Pick ${this.#lobbyState.picks.length + 1}: ${this._getPlayerName(this.#lobbyState.nextPlayer)}`
         );
   }
   protected async _printCurrentScore() {
      await this.systemMessage(
         `${this._getPlayerName(0)} ${this.#lobbyState.scores[0]} - ` +
            `${this.#lobbyState.scores[1]} ${this._getPlayerName(1)}`
      );
   }
   protected async _printAvailableMaps() {
      if (!this.#mappool) return;

      const unavailable = this.#lobbyState.bans.concat(this.#lobbyState.picks);

      const maplist = (["nm", "hd", "hr", "dt", "fm"] as ModPool[])
         .reduce<string[]>((agg, mod) => {
            const modMaps = this.#mappool![mod].map((map, index) =>
               unavailable.includes(map) ? null : `${mod}${index + 1}`
            )
               .filter((v): v is string => !!v)
               .join(", ");

            agg.push(modMaps);
            return agg;
         }, [])
         .join(", ");

      await this.systemMessage(`Available maps: ${maplist}`);
   }
   protected async _printLobbyInfo() {
      await this._printCurrentScore();
      await this._printPlayerPrompt();
      await this._printAvailableMaps();
   }

   protected async _handlePickBan(map: string) {
      if (!this.#mappool) return;

      const mod = map.slice(0, 2).toLowerCase();
      const mapNo = parseInt(map[2]) - 1;

      if (
         !(mod in this.#mappool) ||
         isNaN(mapNo) ||
         mapNo < 0 ||
         mapNo >= this.#mappool[mod as ModPool].length
      ) {
         await this.systemMessage("Unknown map");
         return;
      }

      const candidateMap = this.#mappool[mod as ModPool][mapNo];

      if (this.#lobbyState.bans.includes(candidateMap))
         return this.systemMessage("That map is banned");
      if (this.#lobbyState.picks.includes(candidateMap))
         return this.systemMessage("That map has already been picked");

      if (this.#lobbyState.action === "ban" || this.#lobbyState.action === "tbban")
         this.#banMap(candidateMap);
      else this.#pickMap(candidateMap, mod as ModPool);
   }

   async #banMap(map: number) {
      this.#lobbyState.bans.push(map);

      if (this.#lobbyState.action === "ban" && this.#lobbyState.bans.length >= 4) {
         this.#lobbyState.action = "pick";
      } else if (this.#lobbyState.bans.length >= 6) this.#lobbyState.action = "tb";

      this.#lobbyState.nextPlayer = +!this.#lobbyState.nextPlayer;

      await this.systemMessage(`Banned map: ${map}`);
      await this._printPlayerPrompt();
      await this._printAvailableMaps();
   }

   async #pickMap(map: number, mod: ModPool) {
      await this.lobby.setMap(map, Mode[this.mode === "fruits" ? "ctb" : this.mode]);

      // Mania is always freemod. That should be set at lobby creation and never changed
      if (this.mode !== "mania") {
         // CtB allows HD to be picked on HR and DT picks
         if (this.mode === "fruits") {
            if (mod === "dt") this.lobby.setMods("NF DT", true);
            else if (mod === "fm" || mod === "hr") this.lobby.setMods("", true);
            else this.lobby.setMods(`NF ${mod === "hd" ? "HD" : ""}`);
         } else
            await this.lobby.setMods(`NF ${mod !== "nm" ? mod.toUpperCase() : ""}`, mod === "fm");
      }

      this.#lobbyState.activePick = { map, modpool: mod };
   }

   protected async _onPlayersReady(): Promise<void> {
      // Make sure the players haven't immediately re-readied
      if (this.#lobbyState.picks.includes(this.lobby.beatmapId)) return;

      // Make sure all players are still in the lobby
      if (!this._allPlayersPresent()) return;

      if (this.#lobbyState.action === "tb") {
         await this.lobby.updateSettings();

         if (
            this.lobby.slots.some(player => {
               if (!player) return false;
               return !player.mods.includes(BanchoMods.NoFail);
            })
         ) {
            await this.systemMessage("NoFail is required.");
            return;
         }
      } else if (this.#lobbyState.activePick.modpool === "fm") {
         if (this.mode !== "mania") {
            // Make sure both players have mods enabled.
            await this.lobby.updateSettings();

            if (
               this.lobby.slots.some(player => {
                  if (!player) return false;

                  return (
                     !player.mods.includes(BanchoMods.NoFail) ||
                     !(
                        player.mods.includes(BanchoMods.Hidden) ||
                        player.mods.includes(BanchoMods.HardRock)
                     )
                  );
               })
            ) {
               await this.systemMessage("NoFail is required. HD or HR is required.");
               return;
            }
         }
      } else if (this.mode === "fruits") {
         if (this.#lobbyState.activePick.modpool === "hr") {
            await this.lobby.updateSettings();
            if (
               this.lobby.slots.some(player => {
                  if (!player) return false;
                  return (
                     !player.mods.includes(BanchoMods.NoFail) ||
                     !player.mods.includes(BanchoMods.HardRock)
                  );
               })
            )
               return this.systemMessage("NoFail and HardRock are both required.");
         } else if (this.#lobbyState.activePick.modpool === "dt") {
            await this.lobby.updateSettings();
            if (
               this.lobby.slots.some(player => {
                  if (!player) return false;
                  return (
                     !player.mods.includes(BanchoMods.NoFail) ||
                     player.mods.includes(BanchoMods.Easy)
                  );
               })
            )
               return this.systemMessage("NoFail is required. HD optional");
         }
      }

      // If selected mods are all in order, start the match
      this.lobby.startMatch(5);
   }

   protected abstract _calculateWinner(scores: BanchoLobbyPlayerScore[]): number;
   protected async _onSongFinished(scores: BanchoLobbyPlayerScore[]): Promise<void> {
      console.log(
         scores.map(s => ({
            player: s.player.user.username,
            score: s.score
         }))
      );

      const winnerIndex = this._calculateWinner(scores);
      if (winnerIndex < 0) {
         console.warn("Winner index out of bounds");
         return;
      }

      if (++this.#lobbyState.scores[winnerIndex] > this.BO / 2) return this.#matchCompleted();

      await this._printCurrentScore();

      // Add the played map to the pick history
      this.#lobbyState.picks.push(this.#lobbyState.activePick.map);

      if (this.#lobbyState.picks.length < this.BO - 1) {
         // Toggle 0 and 1
         this.#lobbyState.nextPlayer = +!this.#lobbyState.nextPlayer;
         await this._printPlayerPrompt();
      } else {
         this.#lobbyState.action = "tbban";
         await this.systemMessage(
            `Tiebreaker! ${this._getPlayerName(this.#lobbyState.nextPlayer)} please ban two maps`
         );
      }

      await this._printAvailableMaps();
   }

   protected _finishByDefault(winnerId: number) {
      const playerIds = this._getPlayerIds();
      this.emit("finished", {
         mp: this.lobby.id,
         score: playerIds.map((id, i) => ({
            playerId: id,
            score: this.#lobbyState.scores[i]
         })),
         defaultWinner: winnerId
      });

      this.closeLobby(1000);
   }
   async #matchCompleted() {
      await this._printCurrentScore();
      await this.systemMessage(
         `GGWP! ${this._getPlayerName(
            this.#lobbyState.scores[0] > this.#lobbyState.scores[1] ? 0 : 1
         )} won the match.`
      );

      const playerIds = this._getPlayerIds();
      this.emit("finished", {
         mp: this.lobby.id,
         score: playerIds.map((id, i) => ({ playerId: id, score: this.#lobbyState.scores[i] }))
      });

      // Close the lobby
      this.closeLobby(10000);
   }
}

export default MpLobbyBase;
