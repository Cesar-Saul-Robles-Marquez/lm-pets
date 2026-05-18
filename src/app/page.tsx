"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Pet } from "@/lib/types";
import { createSaveSlot, getPetsForSlot, setActiveSlotIndex } from "@/lib/storage";
import { saveSlotsStore } from "@/lib/localStores";

function typeToSheet(type: string): string {
  switch (type) {
    case "peyo":
      return "/Recursos/SpriteSheets/PeyoSS.png";
    case "micha":
      return "/Recursos/SpriteSheets/MichaSS.png";
    case "kiwi":
      return "/Recursos/SpriteSheets/Kiwi2wb.png?v=20260517c";
    default:
      return "/Recursos/SpriteSheets/PeyoSS.png";
  }
}

function playHoverSound() {
  try {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? w.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch {
    // Ignore audio errors
  }
}


function PetMini({ pet }: { pet: Pet }) {
  const size = 36;
  const frameWidth = size;
  const frameHeight = size;
  const sheetWidth = frameWidth * 5;
  const sheetHeight = frameHeight * 5;

  return (
    <div
      className="h-9 w-9 flex items-center justify-center rounded-md border border-emerald-200 bg-white overflow-hidden"
      title={pet.name}
    >
      <div 
        style={{
          width: frameWidth,
          height: frameHeight,
          backgroundImage: `url(${typeToSheet(pet.type)})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
          backgroundPosition: "0px 0px",
          imageRendering: "pixelated",
        }}
        aria-hidden="true"
      />
    </div>
  );
}

function EmptyMini() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-100 bg-white/50 text-sm font-semibold text-emerald-950/20">
      ?
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const slots = useSyncExternalStore(
    saveSlotsStore.subscribe,
    saveSlotsStore.getSnapshot,
    saveSlotsStore.getServerSnapshot
  );
  const [error, setError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState<boolean>(false);
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const [pendingName, setPendingName] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!toastOpen) return;
    nameInputRef.current?.focus();
  }, [toastOpen]);

  function selectSlot(slotIndex: number) {
    setError(null);
    const existing = slots[slotIndex];
    if (existing) {
      setActiveSlotIndex(slotIndex);
      router.push("/game");
      return;
    }

    setPendingSlotIndex(slotIndex);
    setPendingName("");
    setToastOpen(true);
  }

  function cancelCreate() {
    setError(null);
    setPendingSlotIndex(null);
    setPendingName("");
    setToastOpen(false);
  }

  function confirmCreate() {
    if (pendingSlotIndex == null) return;
    const res = createSaveSlot(pendingSlotIndex, pendingName);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setActiveSlotIndex(pendingSlotIndex);
    setPendingSlotIndex(null);
    setPendingName("");
    setToastOpen(false);
    router.push("/game");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-emerald-50 px-4 py-10">
      <main className="w-full max-w-6xl">
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-emerald-950 drop-shadow-sm">LM Pets</h1>
        </div>

        {error ? (
          <div className="mx-auto mt-4 w-full max-w-xl rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <div className="mt-12 w-full px-4 pb-12 pt-4">
          <div className="mx-auto flex flex-wrap justify-center gap-8">
            {[0, 1, 2].map((idx) => {
              const name = slots[idx];
              const empty = !name;
              const pets = !empty ? getPetsForSlot(idx).slice(0, 10) : [];
              return (
                <button
                  key={idx}
                  type="button"
                  onMouseEnter={playHoverSound}
                  className={
                    "group relative flex h-72 w-72 flex-col shrink-0 rounded-[2rem] border-2 p-6 text-left shadow-sm transition-all duration-300 ease-out " +
                    (empty
                      ? "border-emerald-200 bg-white hover:-translate-y-2 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/5"
                      : "border-emerald-300 bg-emerald-100/50 hover:-translate-y-2 hover:border-emerald-400 hover:bg-emerald-100 hover:shadow-xl hover:shadow-emerald-900/10")
                  }
                  onClick={() => selectSlot(idx)}
                >
                  {empty ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="text-4xl font-black tracking-tight text-emerald-950/15 transition-colors duration-300 group-hover:text-emerald-950/30">
                        Vacío
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="truncate text-3xl font-bold text-emerald-950 group-hover:text-emerald-900 transition-colors">
                        {name}
                      </div>
                      <div className="mt-auto grid grid-cols-5 gap-3">
                        {Array.from({ length: 10 }).map((_, i) => {
                          const pet = pets[i];
                          return pet ? <PetMini key={pet.id ?? i} pet={pet} /> : <EmptyMini key={i} />;
                        })}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Modal: create profile */}
      {toastOpen && pendingSlotIndex != null ? (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/20 backdrop-blur-sm p-4 transition-opacity"
          onClick={cancelCreate}
        >
          <div 
            className="w-full max-w-md rounded-[2rem] border border-emerald-100 bg-white p-8 shadow-2xl transition-transform transform scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-2xl font-black text-emerald-950 text-center">Crear perfil</div>
            <div className="mt-2 text-sm text-emerald-950/70 text-center">Ingresa tu nombre para comenzar tu aventura</div>
            <div className="mt-8 flex flex-col gap-4">
              <input
                ref={nameInputRef}
                className="h-14 w-full rounded-2xl border border-emerald-200 bg-emerald-50/50 px-5 text-lg font-medium text-emerald-950 placeholder:text-emerald-950/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                placeholder="Tu nombre..."
                value={pendingName}
                onChange={(e) => {
                  setError(null);
                  setPendingName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreate();
                  if (e.key === "Escape") cancelCreate();
                }}
              />
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  className="h-12 flex-1 rounded-2xl bg-emerald-600 px-4 text-base font-bold text-white shadow-sm hover:bg-emerald-500 hover:shadow transition-all"
                  onClick={confirmCreate}
                >
                  Crear
                </button>
                <button
                  type="button"
                  className="h-12 flex-1 rounded-2xl border border-emerald-200 bg-white px-4 text-base font-bold text-emerald-900 shadow-sm hover:bg-emerald-50 transition-all"
                  onClick={cancelCreate}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
