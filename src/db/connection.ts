import { MongoClient, ServerApiVersion, Collection } from "mongodb";
import { DbHistory } from "../types/database.history";
import { DbPlayer } from "../types/database.player";

console.log("Create mongo connection");
const client = new MongoClient(process.env.MONGO_CONNECTION || "", {
   serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
   }
});

export const db = client.db("packchallenge");
export const historyDb = db.collection<DbHistory>("history");
//const mappacksDb = db.collection("maps");
export const playersDb = db.collection<DbPlayer>("players");
