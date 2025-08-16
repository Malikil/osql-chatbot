import { MongoClient, ServerApiVersion, Collection } from "mongodb";
import { DbHistory } from "../types/database.history";
import { DbPlayer } from "../types/database.player";
import { DbBeatmap } from "../types/database.beatmap";

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
export const osuDb = db.collection<DbBeatmap>("osu");
export const taikoDb = db.collection<DbBeatmap>("taiko");
export const fruitsDb = db.collection<DbBeatmap>("fruits");
export const maniaDb = db.collection<DbBeatmap>("mania");
export const mapsDb = {
   osu: osuDb,
   taiko: taikoDb,
   fruits: fruitsDb,
   mania: maniaDb
} as const;
export const playersDb = db.collection<DbPlayer>("players");
