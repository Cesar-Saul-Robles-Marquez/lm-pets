import {
  getActiveSlotIndex,
  getActiveUser,
  getInventoryForSlot,
  getSaveSlots,
  type Inventory,
} from "@/lib/storage";

type Listener = () => void;

const EMPTY_SLOTS: Array<string | null> = [null, null, null];
const EMPTY_ACTIVE_USER: string | null = null;
const EMPTY_ACTIVE_SLOT: number | null = null;
const EMPTY_INVENTORY: Inventory = { fish: 0, water: 0, seeds: 0, corn: 0 };

let cachedSlots: Array<string | null> = EMPTY_SLOTS;
let cachedActiveUser: string | null = EMPTY_ACTIVE_USER;
let cachedActiveSlot: number | null = EMPTY_ACTIVE_SLOT;
let cachedInventorySlot: number | null = null;
let cachedInventory: Inventory = EMPTY_INVENTORY;

function sameInventory(a: Inventory, b: Inventory) {
  return a.fish === b.fish && a.water === b.water && a.seeds === b.seeds && a.corn === b.corn;
}

function sameNullableStringArray(a: Array<string | null>, b: Array<string | null>) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readSaveSlotsSnapshot(): Array<string | null> {
  if (typeof window === "undefined") return EMPTY_SLOTS;
  const next = getSaveSlots();
  if (sameNullableStringArray(cachedSlots, next)) return cachedSlots;
  cachedSlots = next;
  return cachedSlots;
}

function readActiveUserSnapshot(): string | null {
  if (typeof window === "undefined") return EMPTY_ACTIVE_USER;
  const next = getActiveUser();
  if (next === cachedActiveUser) return cachedActiveUser;
  cachedActiveUser = next;
  return cachedActiveUser;
}

function readActiveSlotSnapshot(): number | null {
  if (typeof window === "undefined") return EMPTY_ACTIVE_SLOT;
  const next = getActiveSlotIndex();
  if (next === cachedActiveSlot) return cachedActiveSlot;
  cachedActiveSlot = next;
  return cachedActiveSlot;
}

function readActiveInventorySnapshot(): Inventory {
  if (typeof window === "undefined") return EMPTY_INVENTORY;
  const slot = getActiveSlotIndex();
  if (slot == null) return EMPTY_INVENTORY;

  const next = getInventoryForSlot(slot);
  if (slot === cachedInventorySlot && sameInventory(cachedInventory, next)) return cachedInventory;
  cachedInventorySlot = slot;
  cachedInventory = next;
  return cachedInventory;
}

function subscribeToLocalStorage(listener: Listener) {
  if (typeof window === "undefined") return () => {};

  const onAny = () => listener();
  window.addEventListener("storage", onAny);
  window.addEventListener("lmPets:storage", onAny);

  return () => {
    window.removeEventListener("storage", onAny);
    window.removeEventListener("lmPets:storage", onAny);
  };
}

export const usersStore = {
  subscribe: subscribeToLocalStorage,
  // Backward compatible export name: this used to be a user list.
  // Now it represents the 3 fixed save slots.
  getSnapshot: readSaveSlotsSnapshot,
  getServerSnapshot: () => EMPTY_SLOTS,
};

export const saveSlotsStore = usersStore;

export const activeUserStore = {
  subscribe: subscribeToLocalStorage,
  getSnapshot: readActiveUserSnapshot,
  getServerSnapshot: () => EMPTY_ACTIVE_USER,
};

export const activeSlotStore = {
  subscribe: subscribeToLocalStorage,
  getSnapshot: readActiveSlotSnapshot,
  getServerSnapshot: () => EMPTY_ACTIVE_SLOT,
};

export const activeInventoryStore = {
  subscribe: subscribeToLocalStorage,
  getSnapshot: readActiveInventorySnapshot,
  getServerSnapshot: () => EMPTY_INVENTORY,
};
