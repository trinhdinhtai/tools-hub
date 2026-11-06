import { serveWorker } from "@/lib/worker";
import { handleFileJob } from "./file-jobs";

serveWorker(handleFileJob);
