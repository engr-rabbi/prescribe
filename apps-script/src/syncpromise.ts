// Apps Script cannot await: doPost() must return synchronously, but every Google
// call (SpreadsheetApp, DriveApp, …) is itself synchronous. The shared handlers are
// written with async/await, so the Apps Script bundle is compiled to ES2016 (async
// functions become generators driven by `new Promise`) and the global Promise is
// replaced by this *synchronous* implementation: callbacks run immediately, so by
// the time a handler "returns" its promise is already settled and can be read.

type Fn<T, R> = (v: T) => R | PromiseLike<R>;

export class SyncPromise<T> implements PromiseLike<T> {
  private state: "pending" | "ok" | "err" = "pending";
  private value!: T;
  private reason: unknown;
  private waiting: Array<() => void> = [];

  constructor(executor: (resolve: (v: T | PromiseLike<T>) => void, reject: (e: unknown) => void) => void) {
    const resolve = (v: T | PromiseLike<T>) => {
      if (this.state !== "pending") return;
      if (v && typeof (v as PromiseLike<T>).then === "function") {
        (v as PromiseLike<T>).then(resolve, reject);
        return;
      }
      this.state = "ok";
      this.value = v as T;
      this.flush();
    };
    const reject = (e: unknown) => {
      if (this.state !== "pending") return;
      this.state = "err";
      this.reason = e;
      this.flush();
    };
    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }

  private flush() {
    const w = this.waiting;
    this.waiting = [];
    for (const f of w) f();
  }

  then<R1 = T, R2 = never>(
    onOk?: Fn<T, R1> | null,
    onErr?: ((e: unknown) => R2 | PromiseLike<R2>) | null
  ): SyncPromise<R1 | R2> {
    return new SyncPromise<R1 | R2>((resolve, reject) => {
      const run = () => {
        try {
          if (this.state === "ok") {
            if (onOk) resolve(onOk(this.value) as R1);
            else resolve(this.value as unknown as R1);
          } else if (onErr) {
            resolve(onErr(this.reason) as R2);
          } else {
            reject(this.reason);
          }
        } catch (e) {
          reject(e);
        }
      };
      if (this.state === "pending") this.waiting.push(run);
      else run();
    });
  }

  catch<R = never>(onErr: (e: unknown) => R | PromiseLike<R>) {
    return this.then(undefined, onErr);
  }

  finally(f: () => void) {
    return this.then(
      (v) => {
        f();
        return v;
      },
      (e) => {
        f();
        throw e;
      }
    );
  }

  /** Synchronously read the settled outcome (throws if still pending). */
  settle(): T {
    if (this.state === "ok") return this.value;
    if (this.state === "err") throw this.reason;
    throw new Error("Promise is still pending — something awaited a real asynchronous operation");
  }

  static resolve<V>(v: V | PromiseLike<V>): SyncPromise<V> {
    return new SyncPromise<V>((res) => res(v));
  }
  static reject(e: unknown): SyncPromise<never> {
    return new SyncPromise<never>((_r, rej) => rej(e));
  }
  static all<V>(items: Iterable<V | PromiseLike<V>>): SyncPromise<V[]> {
    return new SyncPromise<V[]>((resolve, reject) => {
      const arr = [...items];
      const out: V[] = new Array(arr.length);
      let left = arr.length;
      if (!left) return resolve(out);
      arr.forEach((it, i) =>
        SyncPromise.resolve(it).then((v) => {
          out[i] = v;
          if (--left === 0) resolve(out);
        }, reject)
      );
    });
  }
}

export function installSyncPromise() {
  (globalThis as unknown as { Promise: unknown }).Promise = SyncPromise;
}
