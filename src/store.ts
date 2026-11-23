export type Answer = {
  projectId: number;
  tileId: number;
  valid: boolean;
  at: number;
  guest: string;
};

type StoreName = "tiles" | "answers" | "outbox" | "files";
const STORES: StoreName[] = ["tiles", "answers", "outbox", "files"];

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("fair-validate", 2);
    request.onupgradeneeded = () => {
      for (const name of STORES)
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      database = undefined;
      reject(new Error("Close other fAIr Validate tabs to finish updating."));
    };
  });
  return database;
}

async function run<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  act: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const request = act(transaction.objectStore(name));
    // A write is only stored once its transaction commits; QuotaExceededError arrives as an abort.
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? request.error);
  });
}

export const answerKey = (projectId: number, tileId: number) =>
  `${projectId}:${tileId}`;

export const getTile = (key: string) =>
  run<ArrayBuffer | undefined>("tiles", "readonly", (s) => s.get(key));
export const putTile = (key: string, data: ArrayBuffer) =>
  run("tiles", "readwrite", (s) => s.put(data, key));
export const tileKeys = (prefix: string) =>
  run<IDBValidKey[]>("tiles", "readonly", (s) =>
    s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)),
  );
export const getFile = (url: string) =>
  run<ArrayBuffer | undefined>("files", "readonly", (s) => s.get(url));
export const putFile = (url: string, data: ArrayBuffer) =>
  run("files", "readwrite", (s) => s.put(data, url));
export const deleteTile = (key: string) =>
  run("tiles", "readwrite", (s) => s.delete(key));

export async function saveAnswer(answer: Answer): Promise<void> {
  const key = answerKey(answer.projectId, answer.tileId);
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["answers", "outbox"], "readwrite");
    transaction.objectStore("answers").put(answer, key);
    transaction.objectStore("outbox").put(answer, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

export const projectAnswers = (projectId: number) =>
  run<Answer[]>("answers", "readonly", (s) =>
    s.getAll(IDBKeyRange.bound(`${projectId}:`, `${projectId}:￿`)),
  );
export const pendingAnswers = () =>
  run<Answer[]>("outbox", "readonly", (s) => s.getAll());
export async function removeSent(answer: Answer): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    const key = answerKey(answer.projectId, answer.tileId);
    const current = store.get(key);
    current.onsuccess = () => {
      if ((current.result as Answer | undefined)?.at === answer.at)
        store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
