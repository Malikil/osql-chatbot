const { BanchoClient } = require("bancho.js");
const client = new BanchoClient({
   username: process.env.OSU_IRC_USERNAME,
   password: process.env.OSU_IRC_PASSWORD,
   apiKey: process.env.OSU_API_KEY
});
const commands = require("./commands");
const matchmaker = require("./matching");
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

// Clean up when asked to exit
process.on("SIGTERM", () => {
   console.log("SIGTERM - Exit process...");
   process.emit("terminateLobbies");
   matchmaker.end();
   client.removeAllListeners("PM");
   client.disconnect();

   process.exit();
});
