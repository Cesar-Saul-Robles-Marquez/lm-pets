"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Pet } from "@/lib/types";
import { createSaveSlot, getPetsForSlot, setActiveSlotIndex } from "@/lib/storage";
import { saveSlotsStore } from "@/lib/localStores";

const SHEET_SIZE = 500;

function typeToSheet(type: string): string {
  switch (type) {
    case "peyo":
      return "/Recursos/SpriteSheets/PeyoSS.png";
    case "micha":
      return "/Recursos/SpriteSheets/MichaSS.png";
    default:
      return "/Recursos/SpriteSheets/PeyoSS.png";
  }
}

function PetMini({ pet }: { pet: Pet }) {
  return (
    <div
      className="h-9 w-9 rounded-md border border-emerald-200 bg-white"
      style={{
        backgroundImage: `url(${typeToSheet(pet.type)})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${SHEET_SIZE}px ${SHEET_SIZE}px`,
        backgroundPosition: "0px 0px",
        imageRendering: "pixelated",
      }}
      aria-hidden="true"
      title={pet.name}
    />
  );
}

function EmptyMini() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-white text-sm font-semibold text-emerald-950/35">
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
          <h1 className="text-5xl font-semibold tracking-tight text-emerald-950">LM Pets</h1>
          <p className="mt-2 text-sm text-emerald-950/70">
            Elige un archivo. Si está vacío, créalo poniendo tu nombre.
          </p>
        </div>

        {error ? (
          <div className="mx-auto mt-4 w-full max-w-xl rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <div className="mx-auto flex w-max min-w-full justify-center gap-4">
            {[0, 1, 2].map((idx) => {
              const name = slots[idx];
              const empty = !name;
              const pets = !empty ? getPetsForSlot(idx).slice(0, 10) : [];
              return (
                <button
                  key={idx}
                  type="button"
                  className={
                    "group relative h-80 w-80 shrink-0 rounded-2xl border p-4 text-left shadow-sm transition-colors " +
                    (empty
                      ? "border-emerald-200 bg-white hover:bg-emerald-50"
                      : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100")
                  }
                  onClick={() => selectSlot(idx)}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-emerald-950/70">Archivo {idx + 1}</div>
                      <div className="mt-0.5 truncate text-lg font-semibold text-emerald-950">
                        {empty ? "Vacío" : name}
                      </div>
                      <div className="mt-0.5 text-xs text-emerald-950/60">
                        {empty ? "Click para crear" : "Click para jugar"}
                      </div>
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-900">
                      {empty ? "Crear" : "Jugar"}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {Array.from({ length: 10 }).map((_, i) => {
                      const pet = pets[i];
                      return pet ? <PetMini key={pet.id ?? i} pet={pet} /> : <EmptyMini key={i} />;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-xl text-center text-xs text-emerald-950/60">
          Tip: cada archivo guarda sus mascotas y tutorial.
        </div>
      </main>

      {/* Toast: create profile */}
      {toastOpen && pendingSlotIndex != null ? (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="w-full max-w-lg rounded-xl border border-emerald-200 bg-white p-4 text-emerald-950 shadow-sm">
            <div className="text-sm font-semibold">Crear archivo {pendingSlotIndex + 1}</div>
            <div className="mt-1 text-xs text-emerald-950/70">Nombre del jugador</div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                ref={nameInputRef}
                className="h-10 flex-1 rounded-md border border-emerald-200 bg-white px-3 text-sm text-emerald-950 placeholder:text-emerald-950/40"
                placeholder="Ej: Saul"
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
              <button
                type="button"
                className="h-10 rounded-md bg-emerald-700 px-3 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                onClick={confirmCreate}
              >
                Crear
              </button>
              <button
                type="button"
                className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm text-emerald-900 hover:bg-emerald-50"
                onClick={cancelCreate}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
