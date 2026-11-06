import { serveWorker } from "@/lib/worker";
import { handleMatchJob } from "./match-jobs";

serveWorker(handleMatchJob);
