const { BanchoClient } = require("bancho.js");
const Matchmaker = require("./matching/matchmaker");
const LobbyManager = require("./matching/lobby-manager");

const client = new BanchoClient({
   username: process.env.OSU_IRC_USERNAME,
   password: process.env.OSU_IRC_PASSWORD,
   apiKey: process.env.OSU_API_KEY
});
const matchmaker = new Matchmaker({
   searchRangeIncrement: p => p.range + p.player.rating.rd / 100
});
const lobbyManager = new LobbyManager(client);

const commands = require("./commands").init(matchmaker, lobbyManager);

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
            const commandName = commandArgs.shift().toLowerCase();
            (commands[commandName] || (() => {}))(msg, commandArgs);
         }
      });
   })
   .catch(err => console.error(err));
matchmaker.on("match", p => {
   console.log("Create match with players", p);
   lobbyManager.createLobby(p.sort((a, b) => a.rating.rating - b.rating.rating));
});

// Clean up when asked to exit
process.on("SIGTERM", () => {
   console.log("SIGTERM - Exit process...");
   matchmaker.end();
   client.removeAllListeners("PM");
   client.disconnect();

   process.exit();
});
