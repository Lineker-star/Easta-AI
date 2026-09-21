/* Phase 24: a tiny IndexedDB-backed queue for messages composed while
 * offline. Deliberately hand-rolled (one object store, one shape) --
 * not worth a library dependency for. Loaded as a plain global script
 * (not a module), same as every other file here, and used by chat.js.
 * Every function degrades to a thrown/rejected promise if IndexedDB
 * itself is unavailable (very old browsers, some locked-down private-
 * browsing modes) -- callers in chat.js already wrap these in
 * try/catch and fall back to the old "just show an error" behavior. */

const OFFLINE_DB_NAME = "easta-offline-queue";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE_NAME = "pending-messages";


function openOfflineQueueDb() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB is not available in this browser."));
            return;
        }

        const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
                db.createObjectStore(OFFLINE_STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


// payload shape: { conversationId, message, language, images,
// research, image_aspect_ratio, displayText, displayImages }
// (the last two are only for re-rendering the queued bubble after a
// page reload -- everything else is exactly the POST body chat.js
// already sends for a live message).
async function addQueuedMessage(payload) {
    const db = await openOfflineQueueDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
        const store = tx.objectStore(OFFLINE_STORE_NAME);
        const request = store.add({ ...payload, queuedAt: Date.now() });

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
    });
}


async function getQueuedMessages(conversationId = null) {
    const db = await openOfflineQueueDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
        const store = tx.objectStore(OFFLINE_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const all = request.result || [];
            resolve(
                conversationId === null
                    ? all
                    : all.filter((item) => item.conversationId === conversationId)
            );
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
    });
}


async function removeQueuedMessage(id) {
    const db = await openOfflineQueueDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
        const store = tx.objectStore(OFFLINE_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
    });
}
