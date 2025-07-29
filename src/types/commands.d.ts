import { PrivateMessage } from "bancho.js";

export type BanchoCommand = (msg: PrivateMessage) => Promise<null>;
