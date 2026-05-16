"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Pet, PetMood, PetType } from "@/lib/types";
import {
  clearActiveUser,
  getPetsForSlot,
  getTutorialSeenForSlot,
  setInventoryForSlot,
  setPetsForSlot,
  setTutorialSeenForSlot,
} from "@/lib/storage";
import { makeId } from "@/lib/id";
import { petStore } from "@/lib/petStore";
import { activeInventoryStore, activeSlotStore, activeUserStore } from "@/lib/localStores";
import { GameTopMenu } from "@/components/GameTopMenu";
import { PetSprite } from "@/components/PetSprite";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { FOODS, FOOD_SPRITESHEET_URL, type FoodId, feedPetWithFood } from "@/lib/foods";
import type { Inventory } from "@/lib/storage";

const MAX_PETS = 10;
const PET_SIZE = 100;
const STEP_MS = 16.666; // 60 FPS simulation
const CAMERA_SCALE_SELECTED = 1.7;
const FENCE_CAMERA_SCALE = CAMERA_SCALE_SELECTED;

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
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
      <div className="h-full bg-emerald-700" style={{ width: `${v}%` }} />
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
    energy: Number.isFinite(raw.energy) ? clamp(raw.energy, 0, 100) : 100,
    hunger: Number.isFinite(raw.hunger) ? clamp(raw.hunger, 0, 100) : 0,
    moodStat: Number.isFinite(raw.moodStat) ? clamp(raw.moodStat, 0, 100) : 70,
  };
}

export default function GamePage() {
  const router = useRouter();

  const worldRef = useRef<HTMLDivElement | null>(null);
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
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const inventory = useSyncExternalStore(
    activeInventoryStore.subscribe,
    activeInventoryStore.getSnapshot,
    activeInventoryStore.getServerSnapshot
  );
  const [shopOpen, setShopOpen] = useState<boolean>(false);
  const [shopTab, setShopTab] = useState<"food" | "other">("food");
  const [foodWheelOpen, setFoodWheelOpen] = useState<boolean>(false);
  const [foodWheelHover, setFoodWheelHover] = useState<FoodId | null>(null);
  const foodWheelRef = useRef<HTMLDivElement | null>(null);
  const foodWheelPointerIdRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const [tutorialDismissed, setTutorialDismissed] = useState<boolean>(false);
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  const tutorialOpen =
    slotIndex != null ? !tutorialDismissed && !getTutorialSeenForSlot(slotIndex) : false;

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
    petsRef.current = pets;
  }, [pets]);

  useEffect(() => {
    if (!userName) {
      router.replace("/");
      return;
    }
    if (slotIndex == null) {
      router.replace("/");
      return;
    }
    petStore.setPets(getPetsForSlot(slotIndex).map(normalizePet));
  }, [router, slotIndex, userName]);

  useEffect(() => {
    if (!userName) return;
    if (slotIndex == null) return;
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

      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const step = STEP_MS / 1000;

        const current = petsRef.current;
        if (current.length === 0) break;

        let next = current.map((p) => {
          if (p.moodUntil && p.moodUntil <= nowEpoch) {
            const { moodUntil: moodUntilToClear, ...rest } = p;
            void moodUntilToClear;
            return { ...rest, mood: "walk" as const };
          }
          return p;
        });

        next = next.map((p) => {
          let energy = p.energy;
          let hunger = p.hunger;
          let moodStat = p.moodStat;

          // Simple life-sim stats, adjusted for dt (step in seconds)
          // 0.16 per second to match old 0.008 per 50ms
          const hungerRate = 0.16 * step;
          hunger = clamp(hunger + hungerRate, 0, 100);
          
          const energyRate = 0.1 * step;
          energy = clamp(energy - energyRate, 0, 100);

          const hungryPenalty = hunger > 70 ? 0.3 * step : 0;
          const tiredPenalty = energy < 30 ? 0.24 * step : 0;
          const baseline = 0.04 * step;

          moodStat = clamp(moodStat - (baseline + hungryPenalty + tiredPenalty), 0, 100);
          if (p.mood === "happy") moodStat = clamp(moodStat + 0.6 * step, 0, 100);

          return { ...p, energy, hunger, moodStat };
        });

        next = next.map((p) => {
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
          const moodFactor = p.mood === "walk" ? 1 : 0.35;
          let x = p.x + p.vx * step * moodFactor;
          let y = p.y + p.vy * step * moodFactor;
          let vx = p.vx;
          let vy = p.vy;

          const hardMaxX = Math.max(0, w - PET_SIZE);
          const hardMaxY = Math.max(0, h - PET_SIZE);

          // Fence: keep pets inside a safe perimeter so a selected pet can stay centered
          // under zoom without revealing empty edges.
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

  function interact(petId: string) {
    setSelectedPetId(petId);
    setFoodWheelOpen(false);
    petStore.update((prev) =>
      prev.map((p) =>
        p.id === petId
          ? {
              ...setMood(p, "happy", 1200),
              moodStat: clamp((p.moodStat ?? 70) + 10, 0, 100),
              energy: clamp((p.energy ?? 100) - 2, 0, 100),
            }
          : p
      )
    );
  }

  function selectPet(petId: string) {
    setSelectedPetId(petId);
    setFoodWheelOpen(false);
    setFoodWheelHover(null);
    playApproachSound();
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

  function feedSelected(foodId: FoodId) {
    const petId = selectedPetId;
    if (!petId) return;
    const count = inventory[foodId] ?? 0;
    if (count <= 0) return;

    if (slotIndex == null) return;

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

    const speed = 50 + Math.random() * 60;
    const angle = Math.random() * Math.PI * 2;

    const pet: Pet = {
      id: makeId("pet"),
      type,
      name: trimmed,
      x: Math.random() * Math.max(1, w - PET_SIZE),
      y: Math.random() * Math.max(1, h - PET_SIZE),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      energy: 100,
      hunger: 0,
      moodStat: 70,
      mood: "walk",
    };

    petStore.update((prev) => [...prev, pet]);
    return { ok: true as const };
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

  const availableFoods = FOODS.filter((f) => (inventory[f.id] ?? 0) > 0);

  return (
    <div className="flex flex-1 flex-col">
      <GameTopMenu
        userName={userName}
        pets={pets}
        selectedPetId={selectedPetId}
        onSelectPet={(petId) => setSelectedPetId(petId)}
        onCreatePet={createPet}
        onInteract={interact}
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
          onPointerDown={(e) => {
            const target = e.target;
            if (target instanceof Element && target.closest("button")) return;
            setSelectedPetId(null);
            setFoodWheelOpen(false);
            setFoodWheelHover(null);
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: selectedPet
                ? `translate(${cameraTx}px, ${cameraTy}px) scale(${cameraScale})`
                : "none",
              transformOrigin: "0 0",
              transition: "transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              willChange: "transform",
            }}
          >
            {pets.map((pet) => (
              <PetSprite
                key={pet.id}
                pet={pet}
                onClick={() => selectPet(pet.id)}
              />
            ))}

            {/* Food icon + radial menu next to selected pet */}
            {selectedPet ? (
              <div
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate3d(${selectedPet.x - 60}px, ${selectedPet.y - 20}px, 0)`,
                  transition: "transform 80ms linear",
                  willChange: "transform",
                }}
              >
                <button
                  type="button"
                  className="relative z-10 h-9 w-9 rounded-full border border-emerald-200 bg-white text-emerald-900 shadow-sm hover:bg-emerald-50"
                  onPointerDown={(ev) => {
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
                    if (!foodWheelOpen) return;
                    if (foodWheelPointerIdRef.current !== ev.pointerId) return;
                    const hovered = computeFoodWheelHoverFromPointer(ev);
                    setFoodWheelHover(hovered);
                  }}
                  onPointerUp={(ev) => {
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
                <span>Hambre</span>
                <span className="text-emerald-950/70">{Math.round(selectedPet.hunger ?? 0)}</span>
              </div>
              <StatBar value={selectedPet.hunger ?? 0} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Shop button (bottom-right) */}
      <button
        type="button"
        className={
          "fixed right-4 z-50 h-12 w-12 rounded-xl border border-emerald-200 bg-white text-emerald-900 shadow-sm hover:bg-emerald-50 " +
          (selectedPet ? "bottom-24" : "bottom-4")
        }
        onClick={() => setShopOpen(true)}
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
                  (shopTab === "other"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50")
                }
                onClick={() => setShopTab("other")}
              >
                Otros
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
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950/70">
                Próximamente.
              </div>
            )}
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
