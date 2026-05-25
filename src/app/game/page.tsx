"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Bed, BedColor, Pet, PetMood, PetType } from "@/lib/types";
import {
  clearActiveUser,
  getPetsForSlot,
  getTutorialSeenForSlot,
  setBedsForSlot,
  setInventoryForSlot,
  setPetsForSlot,
  setTutorialSeenForSlot,
} from "@/lib/storage";
import { makeId } from "@/lib/id";
import { petStore } from "@/lib/petStore";
import { activeBedsStore, activeInventoryStore, activeSlotStore, activeUserStore } from "@/lib/localStores";
import { GameTopMenu } from "@/components/GameTopMenu";
import { PetSprite } from "@/components/PetSprite";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { FOODS, FOOD_SPRITESHEET_URL, type FoodId, feedPetWithFood, getFoodPreference } from "@/lib/foods";
import { BED_GRID_COLS, BED_GRID_ROWS, BED_SHOP_DEFAULT_COLOR, BED_SPRITESHEET_URL, bedBackgroundPosition, bedColorToCell } from "@/lib/beds";
import type { Beds, Inventory } from "@/lib/storage";

const MAX_PETS = 10;
const PET_SIZE = 100;
const BED_SIZE = 88;
const FENCE_SPRITESHEET_URL = "/Recursos/Sprites/fences%20sprites.png?v=20260521";
const PET_SLEEP_OFFSET_Y: Record<PetType, number> = {
  peyo: 35,
  micha: 35,
  kiwi: 20,
};
const STEP_MS = 16.666; // 60 FPS simulation
const CAMERA_SCALE_SELECTED = 1.7;
const FENCE_CAMERA_SCALE = CAMERA_SCALE_SELECTED;
const PETTING_COOLDOWN_MS = 3000;
const SLEEP_DURATION_MS = 30_000;

function statBand(v: number) {
  if (v <= 30) return 0; // red
  if (v <= 59) return 1; // yellow
  return 2; // green
}

function computeSleepTargetEnergy(moodStat: number, satiation: number) {
  const a = statBand(moodStat);
  const b = statBand(satiation);
  const minBand = Math.min(a, b);
  const maxBand = Math.max(a, b);
  if (minBand === 0 && maxBand === 0) return 30;
  if (minBand === 0) return 45; // red + (yellow|green)
  if (minBand === 1 && maxBand === 1) return 60;
  if (minBand === 1 && maxBand === 2) return 80;
  return 100; // green + green
}
const WAKE_HUNGER_PENALTY = 5; // -5% saciedad al despertar

type SpriteRect = { x: number; y: number; w: number; h: number };

function computeFenceRect(w: number, h: number) {
  const hardMaxX = Math.max(0, w - PET_SIZE);
  const hardMaxY = Math.max(0, h - PET_SIZE);

  let minX = 0;
  let maxX = hardMaxX;
  let minY = 0;
  let maxY = hardMaxY;

  if (FENCE_CAMERA_SCALE > 1 && w > 0 && h > 0) {
    const marginCenterX = w / (2 * FENCE_CAMERA_SCALE);
    const marginCenterY = h / (2 * FENCE_CAMERA_SCALE);
    const constrainedMinX = marginCenterX - PET_SIZE / 2;
    const constrainedMaxX = w - marginCenterX - PET_SIZE / 2;
    const constrainedMinY = marginCenterY - PET_SIZE / 2;
    const constrainedMaxY = h - marginCenterY - PET_SIZE / 2;

    if (constrainedMaxX >= constrainedMinX) {
      minX = Math.max(0, constrainedMinX);
      maxX = Math.min(hardMaxX, constrainedMaxX);
    }
    if (constrainedMaxY >= constrainedMinY) {
      minY = Math.max(0, constrainedMinY);
      maxY = Math.min(hardMaxY, constrainedMaxY);
    }
  }

  return {
    left: minX,
    top: minY,
    right: maxX + PET_SIZE,
    bottom: maxY + PET_SIZE,
  };
}

function findAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): SpriteRect | null {
  const minX0 = Math.max(0, Math.min(width, Math.trunc(x0)));
  const maxX0 = Math.max(0, Math.min(width, Math.trunc(x1)));
  const minY0 = Math.max(0, Math.min(height, Math.trunc(y0)));
  const maxY0 = Math.max(0, Math.min(height, Math.trunc(y1)));
  if (maxX0 <= minX0 || maxY0 <= minY0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = minY0; y < maxY0; y++) {
    const row = y * width;
    for (let x = minX0; x < maxX0; x++) {
      const a = data[(row + x) * 4 + 3];
      if (!a) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  // +1 because maxX/maxY are inclusive pixel coords.
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function computeFenceSlices(img: HTMLImageElement): { h: SpriteRect; v: SpriteRect } {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      h: { x: 0, y: 0, w: Math.max(1, Math.floor(w * 0.7)), h: Math.max(1, Math.floor(h * 0.3)) },
      v: { x: Math.max(0, Math.floor(w * 0.7)), y: 0, w: Math.max(1, Math.floor(w * 0.3)), h: h },
    };
  }

  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, c.width, c.height);
  const pixels = imageData.data;

  // The sheet contains 2 parts: a horizontal segment on the top-left and a vertical segment on the far-right.
  // Keep windows tight so the bounding box doesn't span both (which would create huge gaps when tiling).
  const hRegion = findAlphaBounds(
    pixels,
    c.width,
    c.height,
    0,
    0,
    Math.floor(c.width * 0.62),
    Math.floor(c.height * 0.40)
  );
  const vRegion = findAlphaBounds(
    pixels,
    c.width,
    c.height,
    Math.floor(c.width * 0.80),
    0,
    c.width,
    c.height
  );

  return {
    h:
      hRegion ?? {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(c.width * 0.7)),
        h: Math.max(1, Math.floor(c.height * 0.3)),
      },
    v:
      vRegion ?? {
        x: Math.max(0, Math.floor(c.width * 0.7)),
        y: 0,
        w: Math.max(1, Math.floor(c.width * 0.3)),
        h: c.height,
      },
  };
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  if (Math.abs(endAngle - startAngle) >= 360) {
    endAngle -= 0.01;
  }
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "L", x, y,
    "Z"
  ].join(" ");
}

function StatBar({ value }: { value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const fillClass = v <= 30 ? "bg-red-600" : v <= 59 ? "bg-amber-500" : "bg-emerald-700";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
      <div className={`h-full ${fillClass}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function setMood(pet: Pet, mood: PetMood, durationMs: number) {
  const until = Date.now() + durationMs;
  return { ...pet, mood, moodUntil: until };
}

function normalizePet(raw: Pet): Pet {
  return {
    ...raw,
    birth:
      raw.birth && Number.isFinite(raw.birth.bornAt)
        ? {
            bornAt: raw.birth.bornAt,
            owner: String(
              (raw.birth as unknown as { owner?: string; father?: string }).owner ??
                (raw.birth as unknown as { owner?: string; father?: string }).father ??
                ""
            ),
          }
        : { bornAt: Date.now(), owner: "" },
    energy: Number.isFinite(raw.energy) ? clamp(raw.energy, 0, 100) : 100,
    hunger: Number.isFinite(raw.hunger) ? clamp(raw.hunger, 0, 100) : 0,
    moodStat: Number.isFinite(raw.moodStat) ? clamp(raw.moodStat, 0, 100) : 70,
  };
}

export default function GamePage() {
  const router = useRouter();

  const worldRef = useRef<HTMLDivElement | null>(null);
  const worldGroupRef = useRef<HTMLDivElement | null>(null);
  const fenceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fenceSpriteRef = useRef<HTMLImageElement | null>(null);
  const fenceSlicesRef = useRef<{ h: SpriteRect; v: SpriteRect } | null>(null);
  const [fenceRedrawTick, setFenceRedrawTick] = useState<number>(0);
  const [worldSize, setWorldSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const slotIndex = useSyncExternalStore(
    activeSlotStore.subscribe,
    activeSlotStore.getSnapshot,
    activeSlotStore.getServerSnapshot
  );
  const userName = useSyncExternalStore(
    activeUserStore.subscribe,
    activeUserStore.getSnapshot,
    activeUserStore.getServerSnapshot
  );
  const pets = useSyncExternalStore(
    petStore.subscribe,
    petStore.getSnapshot,
    petStore.getSnapshot
  );
  const petsRef = useRef<Pet[]>(pets);
  const petsHydratedSlotIndexRef = useRef<number | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const inventory = useSyncExternalStore(
    activeInventoryStore.subscribe,
    activeInventoryStore.getSnapshot,
    activeInventoryStore.getServerSnapshot
  );

  const beds = useSyncExternalStore(
    activeBedsStore.subscribe,
    activeBedsStore.getSnapshot,
    activeBedsStore.getServerSnapshot
  );
  const bedsRef = useRef<Beds>(beds);

  const [shopOpen, setShopOpen] = useState<boolean>(false);
  const [shopTab, setShopTab] = useState<"food" | "beds">("food");
  const [inventoryOpen, setInventoryOpen] = useState<boolean>(false);
  const [inventoryTab, setInventoryTab] = useState<"beds" | "furniture">("beds");

  const [placingBedId, setPlacingBedId] = useState<string | null>(null);
  const [placingBedWorldPos, setPlacingBedWorldPos] = useState<{ x: number; y: number } | null>(null);
  const [movingBedId, setMovingBedId] = useState<string | null>(null);

  const [bedAssignOpen, setBedAssignOpen] = useState<boolean>(false);
  const [bedAssignBedId, setBedAssignBedId] = useState<string | null>(null);
  const [bedAssignOwnerPetId, setBedAssignOwnerPetId] = useState<string | null>(null);
  const [bedAssignColor, setBedAssignColor] = useState<BedColor>(BED_SHOP_DEFAULT_COLOR);

  const [bedOwnerEditOpen, setBedOwnerEditOpen] = useState<boolean>(false);
  const [bedColorEditOpen, setBedColorEditOpen] = useState<boolean>(false);

  const [bedContextMenu, setBedContextMenu] = useState<{ bedId: string; clientX: number; clientY: number } | null>(null);
  const [foodWheelOpen, setFoodWheelOpen] = useState<boolean>(false);
  const [foodWheelHover, setFoodWheelHover] = useState<FoodId | null>(null);
  const foodWheelRef = useRef<HTMLDivElement | null>(null);
  const foodWheelPointerIdRef = useRef<number | null>(null);

  const [pettingCooldownById, setPettingCooldownById] = useState<Record<string, boolean>>({});
  const [pettingCooldownTokenById, setPettingCooldownTokenById] = useState<Record<string, number>>({});
  const pettingCooldownTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const [tutorialDismissed, setTutorialDismissed] = useState<boolean>(false);
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  const tutorialOpen =
    slotIndex != null ? !tutorialDismissed && !getTutorialSeenForSlot(slotIndex) : false;

  useEffect(() => {
    const timers = pettingCooldownTimersRef.current;
    return () => {
      for (const t of Object.values(timers)) {
        clearTimeout(t);
      }
    };
  }, []);

  useEffect(() => {
    const el = worldRef.current;
    if (!el) return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        setWorldSize({ w: rect.width, h: rect.height });
      });
    });
    ro.observe(el);

    // Initial measure (async to avoid setState-in-effect lint).
    raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setWorldSize({ w: rect.width, h: rect.height });
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const img = new Image();
    img.src = FENCE_SPRITESHEET_URL;
    img.onload = () => {
      if (cancelled) return;
      fenceSpriteRef.current = img;
      fenceSlicesRef.current = computeFenceSlices(img);
      setFenceRedrawTick((v) => v + 1);
    };
    img.onerror = () => {
      if (cancelled) return;
      fenceSpriteRef.current = null;
      fenceSlicesRef.current = null;
      setFenceRedrawTick((v) => v + 1);
    };

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = fenceCanvasRef.current;
    const img = fenceSpriteRef.current;
    const slices = fenceSlicesRef.current;
    if (!canvas || !img || !slices) return;

    const w = Math.max(1, Math.round(worldSize.w));
    const h = Math.max(1, Math.round(worldSize.h));
    if (w <= 1 || h <= 1) return;

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const fence = computeFenceRect(w, h);
    const hTile = slices.h;
    const vTile = slices.v;

    const fenceLeft = Math.round(fence.left);
    const fenceTop = Math.round(fence.top);
    const fenceRight = Math.round(fence.right);
    const fenceBottom = Math.round(fence.bottom);

    // Top (repeat-x)
    const topY = fenceTop - hTile.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fenceLeft, topY, Math.max(0, fenceRight - fenceLeft), hTile.h);
    ctx.clip();
    for (let x = fenceLeft - hTile.w; x < fenceRight + hTile.w; x += hTile.w) {
      ctx.drawImage(img, hTile.x, hTile.y, hTile.w, hTile.h, x, topY, hTile.w, hTile.h);
    }
    ctx.restore();
    // Bottom (repeat-x)
    const bottomY = fenceBottom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fenceLeft, bottomY, Math.max(0, fenceRight - fenceLeft), hTile.h);
    ctx.clip();
    for (let x = fenceLeft - hTile.w; x < fenceRight + hTile.w; x += hTile.w) {
      ctx.drawImage(img, hTile.x, hTile.y, hTile.w, hTile.h, x, bottomY, hTile.w, hTile.h);
    }
    ctx.restore();

    // Left (repeat-y)
    const leftX = fenceLeft - vTile.w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(leftX, fenceTop, vTile.w, Math.max(0, fenceBottom - fenceTop));
    ctx.clip();
    for (let y = fenceTop - vTile.h; y < fenceBottom + vTile.h; y += vTile.h) {
      ctx.drawImage(img, vTile.x, vTile.y, vTile.w, vTile.h, leftX, y, vTile.w, vTile.h);
    }
    ctx.restore();
    // Right (repeat-y)
    const rightX = fenceRight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rightX, fenceTop, vTile.w, Math.max(0, fenceBottom - fenceTop));
    ctx.clip();
    for (let y = fenceTop - vTile.h; y < fenceBottom + vTile.h; y += vTile.h) {
      ctx.drawImage(img, vTile.x, vTile.y, vTile.w, vTile.h, rightX, y, vTile.w, vTile.h);
    }
    ctx.restore();
  }, [fenceRedrawTick, worldSize.h, worldSize.w]);

  useEffect(() => {
    petsRef.current = pets;
  }, [pets]);

  useEffect(() => {
    bedsRef.current = beds;
  }, [beds]);

  useEffect(() => {
    if (!userName) {
      router.replace("/");
      return;
    }
    if (slotIndex == null) {
      router.replace("/");
      return;
    }
    // IMPORTANT:
    // Do not persist pets until we've hydrated them from localStorage.
    // In dev (React StrictMode), mount effects can run twice with the *initial render*
    // closure values (often pets=[]), which could otherwise wipe existing saves.
    petsHydratedSlotIndexRef.current = null;
    petStore.setPets(getPetsForSlot(slotIndex).map(normalizePet));
    petsHydratedSlotIndexRef.current = slotIndex;
  }, [router, slotIndex, userName]);

  useEffect(() => {
    if (!userName) return;
    if (slotIndex == null) return;
    if (petsHydratedSlotIndexRef.current !== slotIndex) return;
    setPetsForSlot(slotIndex, pets);
  }, [slotIndex, userName, pets]);

  useEffect(() => {
    if (!userName) return;
    if (slotIndex == null) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      acc += dt;

      const rect = worldRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 900;
      const h = rect?.height ?? 520;
      const nowEpoch = Date.now();

      const fenceRect = computeFenceRect(w, h);
      const minX = fenceRect.left;
      const maxX = Math.max(minX, fenceRect.right - PET_SIZE);
      const minY = fenceRect.top;
      const maxY = Math.max(minY, fenceRect.bottom - PET_SIZE);

      const bedsNow = bedsRef.current;
      const bedByOwner = new Map<string, Bed>();
      for (const b of bedsNow) {
        if (!b.ownerPetId) continue;
        if (b.x == null || b.y == null) continue;
        if (!bedByOwner.has(b.ownerPetId)) bedByOwner.set(b.ownerPetId, b);
      }

      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const step = STEP_MS / 1000;

        const current = petsRef.current;
        if (current.length === 0) break;

        let next = current.map((p) => {
          if (p.moodUntil && p.moodUntil <= nowEpoch) {
            const { moodUntil: moodUntilToClear, ...rest } = p;
            void moodUntilToClear;
            if (p.mood === "sleep") {
              const satiation = clamp(100 - (p.hunger ?? 0), 0, 100);
              const sleepTargetEnergy = computeSleepTargetEnergy(p.moodStat ?? 0, satiation);
              // Wake up hungry (simulate breakfast urge).
              const hunger = clamp((p.hunger ?? 0) + WAKE_HUNGER_PENALTY, 0, 100);
              return { ...rest, mood: "walk" as const, hunger, energy: sleepTargetEnergy };
            }
            return { ...rest, mood: "walk" as const };
          }
          return p;
        });

        next = next.map((p) => {
          let energy = p.energy;
          let hunger = p.hunger;
          let moodStat = p.moodStat;

          // Simple life-sim stats, adjusted for dt (step in seconds)
          if (p.mood === "sleep") {
            // While sleeping: humor + saciedad stay stable.
            const satiation = clamp(100 - hunger, 0, 100);
            const targetEnergy = computeSleepTargetEnergy(moodStat ?? 0, satiation);
            const startEpoch = p.moodUntil ? p.moodUntil - SLEEP_DURATION_MS : nowEpoch;
            const t = clamp((nowEpoch - startEpoch) / SLEEP_DURATION_MS, 0, 1);
            energy = clamp(targetEnergy * t, 0, targetEnergy);
          } else {
            // Awake: hunger increases; energy drains; mood trends down with penalties.
            const hungerRate = 0.16 * step;
            hunger = clamp(hunger + hungerRate, 0, 100);

            const energyRate = 0.1 * step;
            energy = clamp(energy - energyRate, 0, 100);

            const hungryPenalty = hunger > 70 ? 0.3 * step : 0;
            const tiredPenalty = energy < 30 ? 0.24 * step : 0;
            const baseline = 0.04 * step;

            moodStat = clamp(moodStat - (baseline + hungryPenalty + tiredPenalty), 0, 100);
            if (p.mood === "happy") moodStat = clamp(moodStat + 0.6 * step, 0, 100);
          }

          return { ...p, energy, hunger, moodStat };
        });

        // Auto-sleep: low energy forces a fixed 30s sleep.
        next = next.map((p) => {
          if (p.energy <= 0 && p.mood !== "sleep") {
            return { ...p, mood: "sleep" as const, moodUntil: nowEpoch + SLEEP_DURATION_MS };
          }
          return p;
        });

        next = next.map((p) => {
          if (p.mood !== "walk") return p;
          if (Math.random() < 0.02) {
            const speed = 40 + Math.random() * 50;
            const angle = Math.random() * Math.PI * 2;
            return { ...p, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
          }
          return p;
        });

        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i];
            const b = next[j];
            // Don't wake sleeping pets early.
            if (a.mood === "sleep" || b.mood === "sleep") continue;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 60 * 60 && Math.random() < 0.01) {
              next[i] = setMood(a, "happy", 900);
              next[j] = setMood(b, "happy", 900);
              const push = 60;
              next[i] = { ...next[i], vx: clamp(a.vx + (dx >= 0 ? push : -push), -120, 120) };
              next[j] = { ...next[j], vx: clamp(b.vx + (dx >= 0 ? -push : push), -120, 120) };
            }
          }
        }

        next = next.map((p) => {
          let vx = p.vx;
          let vy = p.vy;

          if (p.mood === "sleep") {
            const bed = bedByOwner.get(p.id);
            if (bed && bed.x != null && bed.y != null) {
              const petCx = p.x + PET_SIZE / 2;
              const petCy = p.y + PET_SIZE / 2;
              const bedCx = bed.x + BED_SIZE / 2;
              const bedCy = bed.y + BED_SIZE / 2 - (PET_SLEEP_OFFSET_Y[p.type] ?? 0);
              const dx = bedCx - petCx;
              const dy = bedCy - petCy;
              const d = Math.hypot(dx, dy);
              if (d > 10) {
                const speed = 85;
                vx = (dx / d) * speed;
                vy = (dy / d) * speed;
              } else {
                vx = 0;
                vy = 0;
              }
            } else {
              vx = 0;
              vy = 0;
            }
          }

          const moodFactor = p.mood === "walk" || p.mood === "sleep" ? 1 : 0.35;
          let x = p.x + vx * step * moodFactor;
          let y = p.y + vy * step * moodFactor;

          if (x < minX) {
            x = minX;
            vx = Math.abs(vx);
          }
          if (x > maxX) {
            x = maxX;
            vx = -Math.abs(vx);
          }
          if (y < minY) {
            y = minY;
            vy = Math.abs(vy);
          }
          if (y > maxY) {
            y = maxY;
            vy = -Math.abs(vy);
          }

          return { ...p, x, y, vx, vy };
        });

        petsRef.current = next;
        petStore.setPets(next);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slotIndex, userName]);

  function playApproachSound() {
    if (typeof window === "undefined") return;
    try {
      const win = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.10);
    } catch {
      // ignore
    }
  }

  function playNamSound() {
    if (typeof window === "undefined") return;
    try {
      const win = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  function playMordidasSound() {
    if (typeof window === "undefined") return;
    try {
      const win = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // eslint-disable-next-line react-hooks/purity
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1000;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch {}
  }

  function playPuajSound() {
    if (typeof window === "undefined") return;
    try {
      const win = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  function selectPet(petId: string) {
    setSelectedPetId(petId);
    setFoodWheelOpen(false);
    setFoodWheelHover(null);
    playApproachSound();
  }

  function petSelected() {
    const petId = selectedPetId;
    if (!petId) return;
    if (pettingCooldownById[petId]) return;

    setPettingCooldownById((prev) => ({
      ...prev,
      [petId]: true,
    }));

    setPettingCooldownTokenById((prev) => ({
      ...prev,
      [petId]: (prev[petId] ?? 0) + 1,
    }));

    const prevTimer = pettingCooldownTimersRef.current[petId];
    if (prevTimer) clearTimeout(prevTimer);
    pettingCooldownTimersRef.current[petId] = setTimeout(() => {
      setPettingCooldownById((prev) => ({
        ...prev,
        [petId]: false,
      }));
    }, PETTING_COOLDOWN_MS);

    setFoodWheelOpen(false);
    setFoodWheelHover(null);
    petStore.update((prev) =>
      prev.map((p) =>
        p.id === petId
          ? {
              ...setMood(p, "happy", 1200),
              moodStat: clamp((p.moodStat ?? 70) + 10, 0, 100),
            }
          : p
      )
    );
  }

  function sleepSelected() {
    const petId = selectedPetId;
    if (!petId) return;
    petStore.update((prev) =>
      prev.map((p) =>
        p.id === petId
          ? {
              ...p,
              energy: 0,
              mood: "sleep" as const,
              moodUntil: Date.now() + SLEEP_DURATION_MS,
            }
          : p
      )
    );
  }

  function computeFoodWheelHoverFromPointer(ev: React.PointerEvent): FoodId | null {
    const root = foodWheelRef.current;
    if (!root) return null;
    if (availableFoods.length === 0) {
      return null;
    }

    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    const dist = Math.hypot(dx, dy);

    // Deadzone near center.
    if (dist < 18) {
      return null;
    }

    const n = availableFoods.length;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Normalize so that 0deg is up (top) and increases clockwise.
    const up0 = (deg + 450) % 360;
    const sector = 360 / n;
    const idx = Math.max(0, Math.min(n - 1, Math.floor(up0 / sector)));
    return availableFoods[idx]?.id ?? null;
  }

  function buyFood(foodId: FoodId) {
    if (slotIndex == null) return;
    const next: Inventory = {
      ...inventory,
      [foodId]: (inventory[foodId] ?? 0) + 1,
    };
    setInventoryForSlot(slotIndex, next);
  }

  function updateBeds(updater: (prev: Beds) => Beds) {
    if (slotIndex == null) return;
    const prev = bedsRef.current;
    const next = updater(prev);
    setBedsForSlot(slotIndex, next);
  }

  function buyBed() {
    updateBeds((prev) => [
      ...prev,
      {
        id: makeId("bed"),
        x: null,
        y: null,
        ownerPetId: null,
        color: BED_SHOP_DEFAULT_COLOR,
      },
    ]);
  }

  function pickUpBed(bedId: string) {
    updateBeds((prev) => prev.map((b) => (b.id === bedId ? { ...b, x: null, y: null } : b)));
    setBedContextMenu(null);
    if (placingBedId === bedId) setPlacingBedId(null);
    if (movingBedId === bedId) setMovingBedId(null);
    setPlacingBedWorldPos(null);
  }

  function bedSpriteStyle(color: BedColor, size: number): React.CSSProperties {
    const { col, row } = bedColorToCell(color);
    const pos = bedBackgroundPosition(col, row);
    return {
      width: size,
      height: size,
      backgroundImage: `url(${BED_SPRITESHEET_URL})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${BED_GRID_COLS * 100}% ${BED_GRID_ROWS * 100}%`,
      backgroundPosition: `${pos.x} ${pos.y}`,
    };
  }

  function feedSelected(foodId: FoodId) {
    const petId = selectedPetId;
    if (!petId) return;
    const count = inventory[foodId] ?? 0;
    if (count <= 0) return;

    if (slotIndex == null) return;

    const pet = petsRef.current.find((p) => p.id === petId);
    if (pet) {
      const pref = getFoodPreference(pet.type, foodId);
      if (pref === "love") {
        playNamSound();
      } else if (pref === "like") {
        playMordidasSound();
      } else if (pref === "hate") {
        playPuajSound();
      }
    }

    const next: Inventory = {
      ...inventory,
      [foodId]: Math.max(0, (inventory[foodId] ?? 0) - 1),
    };
    setInventoryForSlot(slotIndex, next);
    petStore.update((prev) => prev.map((p) => (p.id === petId ? feedPetWithFood(p, foodId) : p)));
    setFoodWheelOpen(false);
  }

  function createPet(type: PetType, name: string) {
    if (!userName) return { ok: false as const, error: "Sin usuario" };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false as const, error: "Nombre requerido" };
    if (petsRef.current.length >= MAX_PETS)
      return { ok: false as const, error: `Máximo ${MAX_PETS} mascotas` };

    const rect = worldRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 900;
    const h = rect?.height ?? 520;

    const fence = computeFenceRect(w, h);
    const minX = fence.left;
    const maxX = Math.max(minX, fence.right - PET_SIZE);
    const minY = fence.top;
    const maxY = Math.max(minY, fence.bottom - PET_SIZE);

    const speed = 50 + Math.random() * 60;
    const angle = Math.random() * Math.PI * 2;

    const pet: Pet = {
      id: makeId("pet"),
      type,
      name: trimmed,
      birth: {
        bornAt: Date.now(),
        owner: userName.trim(),
      },
      x: minX + Math.random() * Math.max(1, maxX - minX),
      y: minY + Math.random() * Math.max(1, maxY - minY),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      energy: 100,
      hunger: 0,
      moodStat: 70,
      mood: "walk",
    };

    petStore.update((prev) => [...prev, pet]);
    return { ok: true as const, petId: pet.id };
  }

  function backToMenu() {
    clearActiveUser();
    router.push("/");
  }

  if (!userName || slotIndex == null) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const selectedPet = selectedPetId ? pets.find((p) => p.id === selectedPetId) ?? null : null;

  const cameraScale = selectedPet ? CAMERA_SCALE_SELECTED : 1;
  const w = worldSize.w || 900;
  const h = worldSize.h || 520;
  const petCenterX = selectedPet ? selectedPet.x + PET_SIZE / 2 : w / 2;
  const petCenterY = selectedPet ? selectedPet.y + PET_SIZE / 2 : h / 2;
  const cameraTx = w / 2 - cameraScale * petCenterX;
  const cameraTy = h / 2 - cameraScale * petCenterY;

  function clientToWorldPoint(clientX: number, clientY: number) {
    const rect = worldRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    // IMPORTANT: the inner world group uses a CSS transition on transform.
    // If we map pointer coordinates using the *target* camera values, we can desync
    // from the *actual rendered* transform mid-transition, causing "ghost" bed coords.
    // We instead invert the computed transform matrix applied to the world group.
    const group = worldGroupRef.current;
    if (group && typeof window !== "undefined") {
      const tr = window.getComputedStyle(group).transform;
      if (tr && tr !== "none") {
        try {
          const MatrixCtor: typeof DOMMatrixReadOnly | undefined =
            (window as unknown as { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly }).DOMMatrixReadOnly;
          if (MatrixCtor) {
            const m = new MatrixCtor(tr);
            const inv = m.inverse();
            const pt = new DOMPoint(sx, sy);
            const res = pt.matrixTransform(inv);
            return { x: res.x, y: res.y };
          }
        } catch {
          // ignore and fall back
        }
      }
    }

    // Fallback: compute from intended transform.
    const tx = selectedPet ? cameraTx : 0;
    const ty = selectedPet ? cameraTy : 0;
    const scale = selectedPet ? cameraScale : 1;
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  }

  function clampBedWorldPos(pos: { x: number; y: number }) {
    const fence = computeFenceRect(w, h);
    const minX = fence.left;
    const maxX = Math.max(minX, fence.right - BED_SIZE);
    const minY = fence.top;
    const maxY = Math.max(minY, fence.bottom - BED_SIZE);
    return {
      x: clamp(pos.x, minX, maxX),
      y: clamp(pos.y, minY, maxY),
    };
  }

  const availableFoods = FOODS.filter((f) => (inventory[f.id] ?? 0) > 0);

  const bedsById = new Map(beds.map((b) => [b.id, b] as const));
  const activePlacingBed = placingBedId ? bedsById.get(placingBedId) ?? null : null;
  const activeMovingBed = movingBedId ? bedsById.get(movingBedId) ?? null : null;

  const bedByOwnerPlaced = new Map<string, Bed>();
  for (const b of beds) {
    if (!b.ownerPetId) continue;
    if (b.x == null || b.y == null) continue;
    if (!bedByOwnerPlaced.has(b.ownerPetId)) bedByOwnerPlaced.set(b.ownerPetId, b);
  }

  return (
    <div className="flex flex-1 flex-col">
      <GameTopMenu
        userName={userName}
        pets={pets}
        selectedPetId={selectedPetId}
        onSelectPet={(petId) => setSelectedPetId(petId)}
        onDrainEnergy={(petId) => {
          petStore.update((prev) =>
            prev.map((p) =>
              p.id === petId
                ? {
                    ...p,
                    energy: 0,
                    mood: "sleep" as const,
                    moodUntil: Date.now() + SLEEP_DURATION_MS,
                  }
                : p
            )
          );
        }}
        onCreatePet={createPet}
        onBack={backToMenu}
        maxRows={MAX_PETS}
      />

      <div className="flex flex-1 flex-col pt-14 bg-emerald-50">
        <div className="px-3 py-2 text-sm text-emerald-950/70">
          Haz click en una mascota para seleccionarla.
        </div>
        <div
          ref={worldRef}
          className="relative mx-3 mb-3 flex-1 overflow-hidden rounded-lg border border-emerald-200 bg-white"
          onPointerMove={(e) => {
            if (!placingBedId && !movingBedId) return;
            const nextPos = clampBedWorldPos(clientToWorldPoint(e.clientX, e.clientY));
            setPlacingBedWorldPos(nextPos);
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            setBedContextMenu(null);

            if (placingBedId || movingBedId) {
              const nextPos = clampBedWorldPos(clientToWorldPoint(e.clientX, e.clientY));

              if (placingBedId) {
                const bed = bedsById.get(placingBedId) ?? null;
                updateBeds((prev) =>
                  prev.map((b) => (b.id === placingBedId ? { ...b, x: nextPos.x, y: nextPos.y } : b))
                );
                setBedAssignBedId(placingBedId);
                setBedAssignOwnerPetId(selectedPetId ?? pets[0]?.id ?? null);
                setBedAssignColor((bed?.color ?? BED_SHOP_DEFAULT_COLOR) as BedColor);
                setBedAssignOpen(true);
                setPlacingBedId(null);
                setPlacingBedWorldPos(null);
              } else if (movingBedId) {
                updateBeds((prev) =>
                  prev.map((b) => (b.id === movingBedId ? { ...b, x: nextPos.x, y: nextPos.y } : b))
                );
                setMovingBedId(null);
                setPlacingBedWorldPos(null);
              }

              e.preventDefault();
              e.stopPropagation();
              return;
            }

            const target = e.target;
            if (target instanceof Element && target.closest("button")) return;
            setSelectedPetId(null);
            setFoodWheelOpen(false);
            setFoodWheelHover(null);
          }}
        >
          <div
            className="absolute inset-0"
            ref={worldGroupRef}
            style={{
              transform: selectedPet
                ? `translate(${cameraTx}px, ${cameraTy}px) scale(${cameraScale})`
                : "none",
              transformOrigin: "0 0",
              transition: "transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              willChange: "transform",
            }}
          >
            <canvas
              ref={fenceCanvasRef}
              className="absolute inset-0 pointer-events-none"
              style={{ imageRendering: "pixelated" }}
              aria-hidden="true"
            />

            {beds
              .filter((b) => b.x != null && b.y != null)
              .map((bed) => (
                <div
                  key={bed.id}
                  className="absolute"
                  style={{
                    left: 0,
                    top: 0,
                    transform: `translate3d(${bed.x}px, ${bed.y}px, 0)`,
                    zIndex: Math.max(0, Math.floor((bed.y ?? 0) - 1)),
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBedContextMenu({ bedId: bed.id, clientX: e.clientX, clientY: e.clientY });
                  }}
                >
                  <div style={bedSpriteStyle(bed.color, BED_SIZE)} aria-hidden="true" />
                </div>
              ))}

            {placingBedId || movingBedId ? (
              (() => {
                const bed = activePlacingBed ?? activeMovingBed;
                const fallbackX = bed?.x ?? 0;
                const fallbackY = bed?.y ?? 0;
                const pos = placingBedWorldPos ?? { x: fallbackX, y: fallbackY };
                const color = (bed?.color ?? BED_SHOP_DEFAULT_COLOR) as BedColor;
                return (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: 0,
                      top: 0,
                      transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
                      opacity: 0.65,
                      zIndex: 9999,
                    }}
                  >
                    <div style={bedSpriteStyle(color, BED_SIZE)} aria-hidden="true" />
                  </div>
                );
              })()
            ) : null}

            {pets.map((pet) => (
              <PetSprite
                key={pet.id}
                pet={pet}
                zIndexOverride={(() => {
                  if (pet.mood !== "sleep") return undefined;
                  const bed = bedByOwnerPlaced.get(pet.id);
                  if (!bed) return undefined;
                  if (bed.x == null || bed.y == null) return undefined;
                  const petCx = pet.x + PET_SIZE / 2;
                  const petCy = pet.y + PET_SIZE / 2;
                  const bedCx = bed.x + BED_SIZE / 2;
                  const bedCy = bed.y + BED_SIZE / 2 - (PET_SLEEP_OFFSET_Y[pet.type] ?? 0);
                  const d = Math.hypot(petCx - bedCx, petCy - bedCy);
                  if (d > 22) return undefined;
                  return Math.max(0, Math.floor((bed.y ?? 0) - 1) + 2);
                })()}
                sleepingInBed={(() => {
                  if (pet.mood !== "sleep") return false;
                  const bed = bedByOwnerPlaced.get(pet.id);
                  if (!bed) return false;
                  if (bed.x == null || bed.y == null) return false;
                  const petCx = pet.x + PET_SIZE / 2;
                  const petCy = pet.y + PET_SIZE / 2;
                  const bedCx = bed.x + BED_SIZE / 2;
                  const bedCy = bed.y + BED_SIZE / 2 - (PET_SLEEP_OFFSET_Y[pet.type] ?? 0);
                  const d = Math.hypot(petCx - bedCx, petCy - bedCy);
                  return d <= 22;
                })()}
                onClick={() => selectPet(pet.id)}
              />
            ))}

            {/* Action buttons (pet + food) next to selected pet */}
            {selectedPet ? (
              <div
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate3d(${selectedPet.x - 142}px, ${selectedPet.y - 20}px, 0)`,
                  transition: "transform 80ms linear",
                  willChange: "transform",
                }}
              >
                <div className="flex items-center gap-2">
                  {(() => {
                    const petId = selectedPetId;
                    const coolingDown = petId ? Boolean(pettingCooldownById[petId]) : false;
                    const disabled = !petId || coolingDown || selectedPet.mood === "sleep";
                    const token = petId ? (pettingCooldownTokenById[petId] ?? 0) : 0;
                    return (
                      <button
                        type="button"
                        className={
                          "relative z-10 h-9 w-9 overflow-hidden rounded-full border border-emerald-200 bg-white text-emerald-900 shadow-sm " +
                          (disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-50")
                        }
                        disabled={disabled}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          petSelected();
                        }}
                        aria-label="Acariciar"
                      >
                        {coolingDown ? (
                          <div
                            key={token}
                            className="absolute inset-0 bg-emerald-100"
                            style={{
                              transformOrigin: "0% 50%",
                              animation: `cooldownFill ${PETTING_COOLDOWN_MS}ms linear forwards`,
                            }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          className="relative z-10 mx-auto"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M7 11V7.8a1.3 1.3 0 0 1 2.6 0V11" />
                          <path d="M9.6 11V6.8a1.3 1.3 0 0 1 2.6 0V11" />
                          <path d="M12.2 11V7.4a1.3 1.3 0 0 1 2.6 0V11" />
                          <path d="M14.8 11V8.4a1.3 1.3 0 0 1 2.6 0V15c0 2.8-1.8 5-4.8 5H10c-2.2 0-3.6-1.2-4.4-2.6l-1.4-2.6a1.5 1.5 0 0 1 2.6-1.5L8 12.7" />
                        </svg>
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    className={
                      "relative z-10 h-9 w-9 rounded-full border border-emerald-200 bg-white text-[11px] font-bold text-emerald-900 shadow-sm " +
                      (selectedPet.mood === "sleep" ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-50")
                    }
                    disabled={selectedPet.mood === "sleep"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      sleepSelected();
                    }}
                    aria-label="Dormir"
                  >
                    zzz
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      className={
                        "relative z-10 h-9 w-9 rounded-full border border-emerald-200 bg-white text-emerald-900 shadow-sm " +
                        (selectedPet.mood === "sleep" ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-50")
                      }
                      disabled={selectedPet.mood === "sleep"}
                      onPointerDown={(ev) => {
                        if (selectedPet.mood === "sleep") return;
                        if (availableFoods.length === 0) {
                          setFoodWheelOpen(true);
                          setFoodWheelHover(null);
                        } else {
                          setFoodWheelOpen(true);
                          const hovered = computeFoodWheelHoverFromPointer(ev);
                          setFoodWheelHover(hovered);
                        }
                        foodWheelPointerIdRef.current = ev.pointerId;
                        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
                        ev.preventDefault();
                        ev.stopPropagation();
                      }}
                      onPointerMove={(ev) => {
                        if (selectedPet.mood === "sleep") return;
                        if (!foodWheelOpen) return;
                        if (foodWheelPointerIdRef.current !== ev.pointerId) return;
                        const hovered = computeFoodWheelHoverFromPointer(ev);
                        setFoodWheelHover(hovered);
                      }}
                      onPointerUp={(ev) => {
                        if (selectedPet.mood === "sleep") return;
                        if (foodWheelPointerIdRef.current !== ev.pointerId) return;
                        foodWheelPointerIdRef.current = null;
                        const chosen = computeFoodWheelHoverFromPointer(ev) ?? foodWheelHover;
                        setFoodWheelOpen(false);
                        setFoodWheelHover(null);
                        if (chosen) feedSelected(chosen);
                        ev.preventDefault();
                        ev.stopPropagation();
                      }}
                      onPointerCancel={() => {
                        foodWheelPointerIdRef.current = null;
                        setFoodWheelOpen(false);
                        setFoodWheelHover(null);
                      }}
                      aria-label="Comida"
                      title="Comida"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        className="mx-auto"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-5.3 5.3c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c0 .28.22.5.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5l5.3-5.3Z" />
                      </svg>
                    </button>

                    {foodWheelOpen ? (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                        <div ref={foodWheelRef} className="relative h-48 w-48 drop-shadow-2xl" style={{ pointerEvents: 'none' }}>
                      <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full">
                        <defs>
                          <mask id="gta-hole">
                            <rect width="240" height="240" fill="white" />
                            <circle cx="120" cy="120" r="40" fill="black" />
                          </mask>
                        </defs>
                        <g mask="url(#gta-hole)">
                          {availableFoods.length === 0 ? (
                             <circle cx="120" cy="120" r="120" fill="rgba(2, 44, 34, 0.85)" />
                          ) : availableFoods.length === 1 ? (
                             <circle cx="120" cy="120" r="120" fill={foodWheelHover === availableFoods[0].id ? "rgba(16, 185, 129, 0.95)" : "rgba(2, 44, 34, 0.85)"} className="transition-colors duration-200" />
                          ) : (
                            availableFoods.map((food, idx) => {
                              const n = availableFoods.length;
                              const sector = 360 / n;
                              const startAngle = idx * sector + 1;
                              const endAngle = (idx + 1) * sector - 1;
                              const active = foodWheelHover === food.id;
                              const d = describeArc(120, 120, 120, startAngle, endAngle);
                              return (
                                <path
                                  key={food.id}
                                  d={d}
                                  fill={active ? "rgba(16, 185, 129, 0.95)" : "rgba(2, 44, 34, 0.85)"}
                                  className="transition-colors duration-200"
                                />
                              );
                            })
                          )}
                        </g>
                        <circle cx="120" cy="120" r="119" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" mask="url(#gta-hole)" />
                        <circle cx="120" cy="120" r="41" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                      </svg>

                      {availableFoods.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-medium text-emerald-50">
                          Vacío
                        </div>
                      ) : (
                        availableFoods.map((food, idx) => {
                          const n = availableFoods.length;
                          const sector = 360 / n;
                          const angle = idx * sector + sector / 2;
                          const pos = polarToCartesian(50, 50, 32.5, angle);
                          return (
                            <div
                              key={food.id}
                              className="absolute"
                              style={{
                                left: `${pos.x}%`,
                                top: `${pos.y}%`,
                                transform: "translate(-50%, -50%)",
                                pointerEvents: "auto",
                              }}
                              onClick={() => feedSelected(food.id)}
                            >
                              <div
                                className="h-11 w-11 mx-auto"
                                style={{
                                  backgroundImage: `url(${FOOD_SPRITESHEET_URL})`,
                                  backgroundRepeat: "no-repeat",
                                  backgroundSize: "200% 200%",
                                  backgroundPosition: `${food.sprite.col === 0 ? "0%" : "100%"} ${
                                    food.sprite.row === 0 ? "0%" : "100%"
                                  }`,
                                  filter: foodWheelHover === food.id ? "drop-shadow(0 0 8px rgba(255,255,255,0.8))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                                  transform: foodWheelHover === food.id ? "scale(1.2)" : "scale(1)",
                                  transition: "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 200ms ease",
                                }}
                                aria-hidden="true"
                              />
                              <div className="absolute -bottom-1 -right-1 rounded-full border border-white/20 bg-emerald-950/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                {inventory[food.id] ?? 0}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {pets.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-emerald-950/60">
              No hay mascotas todavía. Abre el menú y crea una.
            </div>
          ) : null}
        </div>
      </div>

      {/* Selected pet stats (bottom-left) */}
      {selectedPet ? (
        <div className="fixed bottom-4 left-4 z-40 w-[min(92vw,260px)] rounded-xl border border-emerald-200 bg-white p-3 text-emerald-950 shadow-sm">
          <div className="text-sm font-semibold">{selectedPet.name}</div>
          <div className="text-[11px] text-emerald-950/70">{selectedPet.type}</div>

          <div className="mt-2 flex flex-col gap-2 text-[11px]">
            <div>
              <div className="flex items-center justify-between">
                <span>Energía</span>
                <span className="text-emerald-950/70">{Math.round(selectedPet.energy ?? 0)}</span>
              </div>
              <StatBar value={selectedPet.energy ?? 0} />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span>Humor</span>
                <span className="text-emerald-950/70">{Math.round(selectedPet.moodStat ?? 0)}</span>
              </div>
              <StatBar value={selectedPet.moodStat ?? 0} />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span>Saciado</span>
                <span className="text-emerald-950/70">{Math.round(100 - (selectedPet.hunger ?? 0))}</span>
              </div>
              <StatBar value={100 - (selectedPet.hunger ?? 0)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Shop button (bottom-right) */}
      <button
        type="button"
        className={
          "fixed right-20 z-50 h-12 w-12 rounded-xl border border-emerald-200 bg-white text-emerald-900 shadow-sm hover:bg-emerald-50 " +
          (selectedPet ? "bottom-24" : "bottom-4")
        }
        onClick={() => {
          setInventoryOpen(true);
          setInventoryTab("beds");
          setShopOpen(false);
          setFoodWheelOpen(false);
        }}
        aria-label="Abrir inventario"
        title="Inventario"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          className="mx-auto"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 7H3" />
          <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
          <path d="M5 7l1 14h12l1-14" />
          <path d="M9 11h6" />
        </svg>
      </button>

      <button
        type="button"
        className={
          "fixed right-4 z-50 h-12 w-12 rounded-xl border border-emerald-200 bg-white text-emerald-900 shadow-sm hover:bg-emerald-50 " +
          (selectedPet ? "bottom-24" : "bottom-4")
        }
        onClick={() => {
          setShopOpen(true);
          setShopTab("food");
          setInventoryOpen(false);
        }}
        aria-label="Abrir tienda"
        title="Tienda"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          className="mx-auto"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 7l1-3h10l1 3" />
          <path d="M3 7h18l-1 14H4L3 7z" />
          <path d="M9 10v8" />
          <path d="M15 10v8" />
        </svg>
      </button>

      {/* Shop panel (tabbed) */}
      {shopOpen ? (
        <div className="fixed inset-0 z-50" onClick={() => setShopOpen(false)}>
          <div className="absolute inset-0 bg-emerald-950/30" />
          <div
            className="absolute bottom-20 right-4 w-[min(92vw,420px)] rounded-xl border border-emerald-200 bg-white p-3 text-emerald-950 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Tienda</div>
              <button
                type="button"
                className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-50"
                onClick={() => setShopOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm " +
                  (shopTab === "food"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50")
                }
                onClick={() => setShopTab("food")}
              >
                Comida
              </button>
              <button
                type="button"
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm " +
                  (shopTab === "beds"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50")
                }
                onClick={() => setShopTab("beds")}
              >
                Camas
              </button>
            </div>

            {shopTab === "food" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {FOODS.map((food) => (
                  <div key={food.id} className="rounded-md border border-emerald-200 bg-white p-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-10 w-10 rounded border border-emerald-200 bg-white"
                        style={{
                          backgroundImage: `url(${FOOD_SPRITESHEET_URL})`,
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "200% 200%",
                          backgroundPosition: `${food.sprite.col === 0 ? "0%" : "100%"} ${
                            food.sprite.row === 0 ? "0%" : "100%"
                          }`,
                        }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">{food.name}</div>
                        <div className="text-[11px] text-emerald-950/70">{food.price} LM Coins</div>
                        <div className="text-[11px] text-emerald-950/70">
                          En inventario: {inventory[food.id] ?? 0}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-2 h-9 w-full rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                      onClick={() => buyFood(food.id)}
                    >
                      Comprar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="rounded-md border border-emerald-200 bg-white p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded border border-emerald-200 bg-white flex items-center justify-center">
                      <div style={bedSpriteStyle(BED_SHOP_DEFAULT_COLOR, 40)} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">Cama (azul)</div>
                      <div className="text-[11px] text-emerald-950/70">150 LM Coins</div>
                      <div className="text-[11px] text-emerald-950/70">Tienes: {beds.length}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-2 h-9 w-full rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                    onClick={buyBed}
                  >
                    Comprar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Inventory panel (tabbed) */}
      {inventoryOpen ? (
        <div className="fixed inset-0 z-50" onClick={() => setInventoryOpen(false)}>
          <div className="absolute inset-0 bg-emerald-950/30" />
          <div
            className="absolute bottom-20 right-20 w-[min(92vw,420px)] rounded-xl border border-emerald-200 bg-white p-3 text-emerald-950 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Inventario</div>
              <button
                type="button"
                className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-50"
                onClick={() => setInventoryOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm " +
                  (inventoryTab === "beds"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50")
                }
                onClick={() => setInventoryTab("beds")}
              >
                Camas
              </button>
              <button
                type="button"
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm " +
                  (inventoryTab === "furniture"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50")
                }
                onClick={() => setInventoryTab("furniture")}
              >
                Muebles
              </button>
            </div>

            {inventoryTab === "beds" ? (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {beds.length === 0 ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950/70">
                    No tienes camas.
                  </div>
                ) : (
                  beds.map((bed) => {
                    const ownerName = bed.ownerPetId ? pets.find((p) => p.id === bed.ownerPetId)?.name ?? "(sin dueño)" : "(sin dueño)";
                    const placed = bed.x != null && bed.y != null;
                    return (
                      <div key={bed.id} className="rounded-md border border-emerald-200 bg-white p-2">
                        <div className="flex items-center gap-2">
                          <div className="h-12 w-12 rounded border border-emerald-200 bg-white flex items-center justify-center">
                            <div style={bedSpriteStyle(bed.color, 44)} aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold">Cama</div>
                            <div className="text-[11px] text-emerald-950/70">Dueño: {ownerName}</div>
                            <div className="text-[11px] text-emerald-950/70">Estado: {placed ? "Colocada" : "Sin colocar"}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="mt-2 h-9 w-full rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                          onClick={() => {
                            setInventoryOpen(false);
                            setShopOpen(false);
                            setBedContextMenu(null);
                            setMovingBedId(null);
                            setPlacingBedId(bed.id);
                            setPlacingBedWorldPos(null);
                          }}
                        >
                          {placed ? "Recolocar" : "Colocar"}
                        </button>
                        {placed ? (
                          <button
                            type="button"
                            className="mt-2 h-9 w-full rounded-md border border-emerald-200 bg-white text-sm text-emerald-900 hover:bg-emerald-50"
                            onClick={() => {
                              setInventoryOpen(false);
                              setShopOpen(false);
                              pickUpBed(bed.id);
                            }}
                          >
                            Recoger
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950/70">
                Vacío.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Bed context menu (right-click) */}
      {bedContextMenu ? (
        <div className="fixed inset-0 z-50" onClick={() => setBedContextMenu(null)}>
          <div
            className="absolute w-56 rounded-md border border-emerald-200 bg-white p-1 text-emerald-950 shadow-lg"
            style={{ left: bedContextMenu.clientX, top: bedContextMenu.clientY }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const bed = bedsById.get(bedContextMenu.bedId);
              const placed = bed?.x != null && bed?.y != null;
              if (!placed) return null;
              return (
                <button
                  type="button"
                  className="w-full rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
                  onClick={() => {
                    pickUpBed(bedContextMenu.bedId);
                    setShopOpen(false);
                    setInventoryOpen(false);
                  }}
                >
                  Recoger
                </button>
              );
            })()}
            <button
              type="button"
              className="w-full rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
              onClick={() => {
                const bed = bedsById.get(bedContextMenu.bedId);
                setBedContextMenu(null);
                setShopOpen(false);
                setInventoryOpen(false);
                setPlacingBedId(null);
                setMovingBedId(bedContextMenu.bedId);
                if (bed?.x != null && bed?.y != null) {
                  setPlacingBedWorldPos({ x: bed.x, y: bed.y });
                } else {
                  setPlacingBedWorldPos(null);
                }
              }}
            >
              Editar posición
            </button>
            <button
              type="button"
              className="w-full rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
              onClick={() => {
                const bed = bedsById.get(bedContextMenu.bedId);
                setBedContextMenu(null);
                setBedAssignBedId(bedContextMenu.bedId);
                setBedAssignOwnerPetId(bed?.ownerPetId ?? (selectedPetId ?? pets[0]?.id ?? null));
                setBedOwnerEditOpen(true);
              }}
            >
              Propietario
            </button>
            <button
              type="button"
              className="w-full rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
              onClick={() => {
                const bed = bedsById.get(bedContextMenu.bedId);
                setBedContextMenu(null);
                setBedAssignBedId(bedContextMenu.bedId);
                setBedAssignColor((bed?.color ?? BED_SHOP_DEFAULT_COLOR) as BedColor);
                setBedColorEditOpen(true);
              }}
            >
              Color
            </button>
          </div>
        </div>
      ) : null}

      {/* Bed assignment modal (after placing) */}
      {bedAssignOpen && bedAssignBedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/30 p-4" onClick={() => {}}>
          <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Asignar cama</div>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-xs font-semibold text-emerald-950/80">Mascota</div>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm"
                  value={bedAssignOwnerPetId ?? ""}
                  onChange={(e) => setBedAssignOwnerPetId(e.target.value || null)}
                >
                  <option value="" disabled>
                    Selecciona una mascota
                  </option>
                  {pets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs font-semibold text-emerald-950/80">Color</div>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {Array.from({ length: BED_GRID_COLS * BED_GRID_ROWS }).map((_, idx) => {
                    const c = idx as BedColor;
                    const active = bedAssignColor === c;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={
                          "h-12 w-12 rounded-md border flex items-center justify-center bg-white " +
                          (active ? "border-emerald-500" : "border-emerald-200 hover:bg-emerald-50")
                        }
                        onClick={() => setBedAssignColor(c)}
                        aria-label={`Color ${idx + 1}`}
                      >
                        <div style={bedSpriteStyle(c, 40)} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-10 flex-1 rounded-md border border-emerald-200 bg-white text-sm text-emerald-900 hover:bg-emerald-50"
                  onClick={() => {
                    // Cancel: revert placement.
                    const id = bedAssignBedId;
                    updateBeds((prev) => prev.map((b) => (b.id === id ? { ...b, x: null, y: null } : b)));
                    setBedAssignOpen(false);
                    setBedAssignBedId(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-10 flex-1 rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                  onClick={() => {
                    if (!bedAssignOwnerPetId) return;
                    const id = bedAssignBedId;
                    updateBeds((prev) =>
                      prev.map((b) =>
                        b.id === id ? { ...b, ownerPetId: bedAssignOwnerPetId, color: bedAssignColor } : b
                      )
                    );
                    setBedAssignOpen(false);
                    setBedAssignBedId(null);
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bed owner edit modal */}
      {bedOwnerEditOpen && bedAssignBedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/30 p-4" onClick={() => setBedOwnerEditOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Cambiar propietario</div>
            <select
              className="mt-3 h-10 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm"
              value={bedAssignOwnerPetId ?? ""}
              onChange={(e) => setBedAssignOwnerPetId(e.target.value || null)}
            >
              <option value="" disabled>
                Selecciona una mascota
              </option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 rounded-md border border-emerald-200 bg-white text-sm text-emerald-900 hover:bg-emerald-50"
                onClick={() => setBedOwnerEditOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-10 flex-1 rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                onClick={() => {
                  if (!bedAssignOwnerPetId) return;
                  const id = bedAssignBedId;
                  updateBeds((prev) => prev.map((b) => (b.id === id ? { ...b, ownerPetId: bedAssignOwnerPetId } : b)));
                  setBedOwnerEditOpen(false);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bed color edit modal */}
      {bedColorEditOpen && bedAssignBedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/30 p-4" onClick={() => setBedColorEditOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Cambiar color</div>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {Array.from({ length: BED_GRID_COLS * BED_GRID_ROWS }).map((_, idx) => {
                const c = idx as BedColor;
                const active = bedAssignColor === c;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={
                      "h-12 w-12 rounded-md border flex items-center justify-center bg-white " +
                      (active ? "border-emerald-500" : "border-emerald-200 hover:bg-emerald-50")
                    }
                    onClick={() => setBedAssignColor(c)}
                    aria-label={`Color ${idx + 1}`}
                  >
                    <div style={bedSpriteStyle(c, 40)} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 rounded-md border border-emerald-200 bg-white text-sm text-emerald-900 hover:bg-emerald-50"
                onClick={() => setBedColorEditOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-10 flex-1 rounded-md bg-emerald-700 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                onClick={() => {
                  const id = bedAssignBedId;
                  updateBeds((prev) => prev.map((b) => (b.id === id ? { ...b, color: bedAssignColor } : b)));
                  setBedColorEditOpen(false);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TutorialOverlay
        open={tutorialOpen}
        step={tutorialStep}
        onSkip={() => {
          setTutorialDismissed(true);
          setTutorialStep(0);
          setTutorialSeenForSlot(slotIndex, true);
        }}
        onNext={() => {
          setTutorialStep((s) => {
            const next = s + 1;
            if (next >= 3) {
              setTutorialDismissed(true);
              setTutorialSeenForSlot(slotIndex, true);
              return 0;
            }
            return next;
          });
        }}
      />
    </div>
  );
}
