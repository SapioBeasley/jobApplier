import { runApplicationQueue } from "../runQueue";

const result = await runApplicationQueue();
console.log(JSON.stringify(result, null, 2));
