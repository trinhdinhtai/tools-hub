import { serveWorker } from "@/lib/worker";
import { handleFormatJob } from "./format-jobs";

serveWorker(handleFormatJob);
