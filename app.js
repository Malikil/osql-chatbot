const { BanchoClient } = require("bancho.js");
const client = new BanchoClient({
   username: process.env.OSU_IRC_USERNAME,
   password: process.env.OSU_IRC_PASSWORD,
   apiKey: process.env.OSU_API_KEY
});
const commands = require("./commands");
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
            const commandName = msg.message.slice(1).toLowerCase();
            (commands[commandName] || (() => {}))(msg);
         }
      });
   })
   .catch(err => console.error(err));
