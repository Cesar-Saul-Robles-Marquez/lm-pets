"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createSaveSlot, setActiveSlotIndex } from "@/lib/storage";
import { saveSlotsStore } from "@/lib/localStores";

export default function Home() {
  const router = useRouter();
  const slots = useSyncExternalStore(
    saveSlotsStore.subscribe,
    saveSlotsStore.getSnapshot,
    saveSlotsStore.getServerSnapshot
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const [pendingName, setPendingName] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (pendingSlotIndex == null) return;
    nameInputRef.current?.focus();
  }, [pendingSlotIndex]);

  function selectSlot(slotIndex: number) {
    setError(null);
    const existing = slots[slotIndex];
    if (existing) {
      setActiveSlotIndex(slotIndex);
      router.push("/game");
      return;
    }

    // prompt() no está disponible en algunos runtimes (ej. sandbox/webviews).
    // Usamos un formulario inline.
    setPendingSlotIndex(slotIndex);
    setPendingName("");
  }

  function cancelCreate() {
    setError(null);
    setPendingSlotIndex(null);
    setPendingName("");
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
    router.push("/game");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-emerald-50 px-4 py-10">
      <main className="w-full max-w-lg rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-emerald-950">LM Pets</h1>
        <p className="mt-1 text-sm text-emerald-950/70">
          Elige un archivo. Si está vacío, créalo poniendo tu nombre.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="grid grid-cols-1 gap-2">
            {[0, 1, 2].map((idx) => {
              const name = slots[idx];
              const empty = !name;
              const pending = pendingSlotIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  className={
                    "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-emerald-50 " +
                    (empty
                      ? "border-emerald-200 bg-white"
                      : "border-emerald-300 bg-emerald-50")
                  }
                  onClick={() => selectSlot(idx)}
                >
                  <div>
                    <div className="text-sm font-semibold text-emerald-950">
                      Archivo {idx + 1}
                    </div>
                    <div className="text-sm text-emerald-950/70">
                      {empty ? (pending ? "Crear nuevo" : "Vacío") : `Jugador: ${name}`}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-emerald-900">
                    {empty ? "Crear" : "Jugar"}
                  </div>
                </button>
              );
            })}
          </div>

          {pendingSlotIndex != null ? (
            <div className="rounded-md border border-emerald-200 bg-white p-3">
              <div className="text-sm font-medium text-emerald-950">
                Archivo {pendingSlotIndex + 1}: nombre del jugador
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  ref={nameInputRef}
                  className="h-10 flex-1 rounded-md border border-emerald-200 bg-white px-3 text-sm text-emerald-950 placeholder:text-emerald-950/40"
                  placeholder="Ej: saul"
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
          ) : null}

          <div className="text-xs text-emerald-950/60">
            Tip: cada archivo guarda sus mascotas y tutorial.
          </div>
        </div>
      </main>
    </div>
  );
}
