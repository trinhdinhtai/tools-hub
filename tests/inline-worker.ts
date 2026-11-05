import { serveWorker, type WorkerHandler, type WorkerScope } from "@/lib/worker";

/**
 * A stand-in for `Worker` (jsdom has none) that runs `handler` on the test's own thread through `serveWorker`, the
 * same way a worker module does. Instances are recorded so tests can check they were terminated.
 */
export function inlineWorker<I, O>(handler: WorkerHandler<I, O>) {
  return class InlineWorker extends EventTarget {
    static instances: InlineWorker[] = [];
    terminated = false;
    private readonly listeners: ((event: MessageEvent) => void)[] = [];

    constructor() {
      super();
      InlineWorker.instances.push(this);
      const scope: WorkerScope = {
        postMessage: (data) => this.deliver(() => this.dispatchEvent(new MessageEvent("message", { data }))),
        addEventListener: (_type, listener) => this.listeners.push(listener),
      };
      serveWorker(handler, scope);
    }

    private deliver(send: () => void) {
      queueMicrotask(() => {
        if (!this.terminated) send();
      });
    }

    postMessage(data: unknown) {
      this.deliver(() => this.listeners.forEach((listener) => listener(new MessageEvent("message", { data }))));
    }

    terminate() {
      this.terminated = true;
    }
  };
}
