const { MongoClient, ServerApiVersion, Collection } = require("mongodb");

console.log("Create mongo connection");
const client = new MongoClient(process.env.MONGO_CONNECTION, {
   serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
   }
});
const db = client.db("packchallenge");
/** @type {Collection<import("../types/database.history").DbHistory>} */
const historyDb = db.collection("history");
//const mappacksDb = db.collection("maps");
/** @type {Collection<import("../types/database.player").DbPlayer>} */
const playersDb = db.collection("players");

module.exports = {
   db,
   historyDb,
   playersDb
};
