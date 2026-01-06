import { BanchoClient } from "bancho.js";
import Matchmaker from "./matching/matchmaker";
import LobbyManager from "./matching/lobby-manager";
import PveManager from "./lobbies/lobby-manager";
import { init as commandInit } from "./commands";

const client = new BanchoClient({
   username: process.env.OSU_IRC_USERNAME || "",
   password: process.env.OSU_IRC_PASSWORD || "",
   apiKey: process.env.OSU_API_KEY
});
const matchmaker = new Matchmaker({
   searchRangeIncrement: p =>
      Math.sqrt(p.range * p.range + (p.player.rating.rd * p.player.rating.rd) / 5)
});
const lobbyManager = new LobbyManager(client);
const pveManager = new PveManager(client);

const commands = commandInit(matchmaker, lobbyManager, pveManager);

client
   .connect()
   .then(() => {
      console.log("Connected to bancho");
      client.on("PM", async msg => {
         if (msg.message.startsWith("!")) {
            console.log(`${msg.user.ircUsername}: ${msg.message}`);
            if (!msg.user.id) {
               console.log("Fetch user info");
               await msg.user.fetchFromAPI();
            }
            const commandArgs = msg.message.slice(1).split(" ");
            const commandName = commandArgs.shift()?.toLowerCase();
            (commands[commandName || ""] || (() => {}))(msg);
         }
      });
   })
   .catch(err => console.error(err));
matchmaker.on("match", (p, mode, variant) => {
   console.log("Create match with players", p);
   lobbyManager.createLobby(
      p.sort((a, b) => a.rating.rating - b.rating.rating),
      mode,
      variant
   );
});

// Clean up when asked to exit
process.on("SIGTERM", async () => {
   console.log("SIGTERM - Exit process...");
   matchmaker.end();
   await pveManager.terminateLobbies();
   client.removeAllListeners("PM");
   client.disconnect();

   process.exit();
});
