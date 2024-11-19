const { BanchoClient } = require("bancho.js");
const client = new BanchoClient({
   username: process.env.OSU_IRC_USERNAME,
   password: process.env.OSU_IRC_PASSWORD,
   apiKey: process.env.OSU_API_KEY
});
client
   .connect()
   .then(() => {
      console.log("Connected to bancho");
      client.on("PM", msg => {
         console.log(`${msg.user.ircUsername}: ${msg.message}`);
      });
   })
   .catch(err => console.error(err));
