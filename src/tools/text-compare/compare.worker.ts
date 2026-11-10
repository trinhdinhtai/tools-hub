import { serveWorker } from "@/lib/worker";
import { handleCompareJob } from "./compare-jobs";

serveWorker(handleCompareJob);
