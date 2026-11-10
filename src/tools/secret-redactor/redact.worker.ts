import { serveWorker } from "@/lib/worker";
import { handleRedactJob } from "./redact-jobs";

serveWorker(handleRedactJob);
