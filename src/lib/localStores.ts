import {
  getActiveSlotIndex,
  getActiveUser,
  getBedsForSlot,
  getInventoryForSlot,
  getSaveSlots,
  type Beds,
  type Inventory,
} from "@/lib/storage";

type Listener = () => void;

const EMPTY_SLOTS: Array<string | null> = [null, null, null];
const EMPTY_ACTIVE_USER: string | null = null;
const EMPTY_ACTIVE_SLOT: number | null = null;
const EMPTY_INVENTORY: Inventory = { fish: 0, water: 0, seeds: 0, corn: 0 };
const EMPTY_BEDS: Beds = [];

let cachedSlots: Array<string | null> = EMPTY_SLOTS;
let cachedActiveUser: string | null = EMPTY_ACTIVE_USER;
let cachedActiveSlot: number | null = EMPTY_ACTIVE_SLOT;
let cachedInventorySlot: number | null = null;
let cachedInventory: Inventory = EMPTY_INVENTORY;
let cachedBedsSlot: number | null = null;
let cachedBeds: Beds = EMPTY_BEDS;

function sameInventory(a: Inventory, b: Inventory) {
  return a.fish === b.fish && a.water === b.water && a.seeds === b.seeds && a.corn === b.corn;
}

function sameBeds(a: Beds, b: Beds) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.ownerPetId !== y.ownerPetId ||
      x.color !== y.color
    ) {
      return false;
    }
  }
  return true;
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

function readActiveBedsSnapshot(): Beds {
  if (typeof window === "undefined") return EMPTY_BEDS;
  const slot = getActiveSlotIndex();
  if (slot == null) return EMPTY_BEDS;

  const next = getBedsForSlot(slot);
  if (slot === cachedBedsSlot && sameBeds(cachedBeds, next)) return cachedBeds;
  cachedBedsSlot = slot;
  cachedBeds = next;
  return cachedBeds;
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

export const activeBedsStore = {
  subscribe: subscribeToLocalStorage,
  getSnapshot: readActiveBedsSnapshot,
  getServerSnapshot: () => EMPTY_BEDS,
};
