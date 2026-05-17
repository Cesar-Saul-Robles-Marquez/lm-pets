import type { Pet } from "@/lib/types";
import type { FoodId } from "@/lib/foods";

// Legacy keys (pre save-slots)
const USERS_KEY = "lmPets.users";
const ACTIVE_USER_KEY = "lmPets.activeUser";

// Save-slot system (classic 3-file saves)
const SAVE_SLOTS_KEY = "lmPets.saveSlots";
const ACTIVE_SLOT_KEY = "lmPets.activeSlot";
const SAVE_SLOTS_COUNT = 3;

function notifyStorageChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("lmPets:storage"));
}

function legacyUserKey(userName: string, suffix: string) {
  return `lmPets.user.${encodeURIComponent(userName)}.${suffix}`;
}

function slotKey(slotIndex: number, suffix: string) {
  return `lmPets.slot.${slotIndex}.${suffix}`;
}

export function normalizeUserName(name: string): string {
  return name.trim();
}

function isValidSlotIndex(slotIndex: number) {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < SAVE_SLOTS_COUNT;
}

function getLegacyUsers(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function readSlotsRaw(): Array<string | null> {
  if (typeof window === "undefined") return Array.from({ length: SAVE_SLOTS_COUNT }, () => null);
  const raw = window.localStorage.getItem(SAVE_SLOTS_KEY);
  if (!raw) return Array.from({ length: SAVE_SLOTS_COUNT }, () => null);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Array.from({ length: SAVE_SLOTS_COUNT }, () => null);

    const slots: Array<string | null> = [];
    for (let i = 0; i < SAVE_SLOTS_COUNT; i++) {
      const v = parsed[i];
      slots.push(typeof v === "string" && v.trim() ? v : null);
    }
    return slots;
  } catch {
    return Array.from({ length: SAVE_SLOTS_COUNT }, () => null);
  }
}

function writeSlots(slots: Array<string | null>) {
  if (typeof window === "undefined") return;
  const normalized: Array<string | null> = [];
  for (let i = 0; i < SAVE_SLOTS_COUNT; i++) {
    const v = slots[i];
    normalized.push(typeof v === "string" && v.trim() ? v : null);
  }
  window.localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(normalized));
  notifyStorageChange();
}

function migrateLegacyUsersToSlotsIfNeeded() {
  if (typeof window === "undefined") return;
  const existingSlots = window.localStorage.getItem(SAVE_SLOTS_KEY);
  if (existingSlots) return;

  const legacyUsers = getLegacyUsers();
  const nextSlots: Array<string | null> = Array.from({ length: SAVE_SLOTS_COUNT }, () => null);
  for (let i = 0; i < SAVE_SLOTS_COUNT; i++) {
    const u = legacyUsers[i];
    nextSlots[i] = typeof u === "string" && u.trim() ? u : null;
  }
  window.localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(nextSlots));

  // Best-effort: map legacy active user to a slot
  const legacyActive = window.localStorage.getItem(ACTIVE_USER_KEY);
  if (legacyActive) {
    const idx = nextSlots.findIndex(
      (n) => n && n.toLowerCase() === legacyActive.toLowerCase()
    );
    if (idx >= 0) {
      window.localStorage.setItem(ACTIVE_SLOT_KEY, String(idx));
    }
  }
  // IMPORTANT: no notifyStorageChange() here.
  // This function is called from read paths (e.g. getSaveSlots -> useSyncExternalStore snapshot),
  // and dispatching events during render can cause React warnings.
}

export function getSaveSlots(): Array<string | null> {
  migrateLegacyUsersToSlotsIfNeeded();
  return readSlotsRaw();
}

export function createSaveSlot(
  slotIndex: number,
  name: string
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: "No disponible" };
  if (!isValidSlotIndex(slotIndex)) return { ok: false, error: "Archivo inválido" };

  const normalized = normalizeUserName(name);
  if (!normalized) return { ok: false, error: "Nombre requerido" };

  const slots = getSaveSlots();
  if (slots[slotIndex]) return { ok: false, error: "Ese archivo ya está ocupado" };

  const exists = slots.some((s) => s && s.toLowerCase() === normalized.toLowerCase());
  if (exists) return { ok: false, error: "Ese nombre ya está en otro archivo" };

  const next = [...slots];
  next[slotIndex] = normalized;
  writeSlots(next);
  return { ok: true, name: normalized };
}

export function setActiveSlotIndex(slotIndex: number) {
  if (typeof window === "undefined") return;
  if (!isValidSlotIndex(slotIndex)) return;
  window.localStorage.setItem(ACTIVE_SLOT_KEY, String(slotIndex));
  const slots = getSaveSlots();
  const name = slots[slotIndex];
  if (name) window.localStorage.setItem(ACTIVE_USER_KEY, name);
  notifyStorageChange();
}

export function getActiveSlotIndex(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_SLOT_KEY);
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const idx = Math.trunc(n);
  return isValidSlotIndex(idx) ? idx : null;
}

export function getActiveUser(): string | null {
  if (typeof window === "undefined") return null;
  const slotIndex = getActiveSlotIndex();
  if (slotIndex == null) return null;
  const slots = getSaveSlots();
  return slots[slotIndex] ?? null;
}

export function clearActiveUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_SLOT_KEY);
  window.localStorage.removeItem(ACTIVE_USER_KEY);
  notifyStorageChange();
}

export function getPetsForSlot(slotIndex: number): Pet[] {
  if (typeof window === "undefined") return [];
  if (!isValidSlotIndex(slotIndex)) return [];
  const raw = window.localStorage.getItem(slotKey(slotIndex, "pets"));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Pet[];
  } catch {
    return [];
  }
}

export function setPetsForSlot(slotIndex: number, pets: Pet[]) {
  if (typeof window === "undefined") return;
  if (!isValidSlotIndex(slotIndex)) return;
  window.localStorage.setItem(slotKey(slotIndex, "pets"), JSON.stringify(pets));
  notifyStorageChange();
}

export function getTutorialSeenForSlot(slotIndex: number): boolean {
  if (typeof window === "undefined") return false;
  if (!isValidSlotIndex(slotIndex)) return false;
  return window.localStorage.getItem(slotKey(slotIndex, "tutorialSeen")) === "1";
}

export function setTutorialSeenForSlot(slotIndex: number, seen: boolean) {
  if (typeof window === "undefined") return;
  if (!isValidSlotIndex(slotIndex)) return;
  window.localStorage.setItem(slotKey(slotIndex, "tutorialSeen"), seen ? "1" : "0");
  notifyStorageChange();
}

export type Inventory = Record<FoodId, number>;

const EMPTY_INVENTORY: Inventory = {
  fish: 0,
  water: 0,
  seeds: 0,
  corn: 0,
};

function normalizeInventory(value: unknown): Inventory {
  const out: Inventory = { ...EMPTY_INVENTORY };
  if (value == null || typeof value !== "object") return out;
  const obj = value as Record<string, unknown>;

  for (const k of Object.keys(EMPTY_INVENTORY) as FoodId[]) {
    const v = obj[k];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = Math.max(0, Math.trunc(n));
  }
  return out;
}

export function getInventoryForSlot(slotIndex: number): Inventory {
  if (typeof window === "undefined") return { ...EMPTY_INVENTORY };
  if (!isValidSlotIndex(slotIndex)) return { ...EMPTY_INVENTORY };
  const raw = window.localStorage.getItem(slotKey(slotIndex, "inventory"));
  if (!raw) return { ...EMPTY_INVENTORY };
  try {
    const parsed = JSON.parse(raw);
    return normalizeInventory(parsed);
  } catch {
    return { ...EMPTY_INVENTORY };
  }
}

export function setInventoryForSlot(slotIndex: number, inv: Inventory) {
  if (typeof window === "undefined") return;
  if (!isValidSlotIndex(slotIndex)) return;
  const normalized = normalizeInventory(inv);
  window.localStorage.setItem(slotKey(slotIndex, "inventory"), JSON.stringify(normalized));
  notifyStorageChange();
}

// Backward-compat helpers (not used by current UI)
// These keep existing save data by name accessible if someone imported them elsewhere.
export function getPets(userName: string): Pet[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(legacyUserKey(userName, "pets"));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Pet[];
  } catch {
    return [];
  }
}

export function setPets(userName: string, pets: Pet[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(legacyUserKey(userName, "pets"), JSON.stringify(pets));
  notifyStorageChange();
}

export function getTutorialSeen(userName: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(legacyUserKey(userName, "tutorialSeen")) === "1";
}

export function setTutorialSeen(userName: string, seen: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(legacyUserKey(userName, "tutorialSeen"), seen ? "1" : "0");
  notifyStorageChange();
}

// Legacy user-list API: keep, but map to the current 3-slot system.
export function getUsers(): string[] {
  return getSaveSlots().filter((x): x is string => typeof x === "string");
}

export function addUser(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const normalized = normalizeUserName(name);
  if (!normalized) return { ok: false, error: "Nombre requerido" };
  const slots = getSaveSlots();
  const firstEmpty = slots.findIndex((s) => !s);
  if (firstEmpty === -1) return { ok: false, error: "No hay archivos libres" };
  return createSaveSlot(firstEmpty, normalized);
}

export function setActiveUser(name: string) {
  if (typeof window === "undefined") return;
  const slots = getSaveSlots();
  const idx = slots.findIndex((s) => s && s.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    setActiveSlotIndex(idx);
    return;
  }
  // Fallback: keep legacy behavior if name isn't in slots.
  window.localStorage.setItem(ACTIVE_USER_KEY, name);
  notifyStorageChange();
}
