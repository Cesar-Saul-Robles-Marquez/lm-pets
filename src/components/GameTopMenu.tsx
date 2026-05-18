"use client";

import { useMemo, useRef, useState } from "react";
import type { Pet, PetType } from "@/lib/types";

function typeToSheet(type: Pet["type"]): string {
  switch (type) {
    case "peyo":
      return "/Recursos/SpriteSheets/PeyoSS.png";
    case "micha":
      return "/Recursos/SpriteSheets/MichaSS.png";
    case "kiwi":
      return "/Recursos/SpriteSheets/Kiwi2wb.png?v=20260517c";
  }
}

function StatBar({ value }: { value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
      <div className="h-full bg-emerald-700" style={{ width: `${v}%` }} />
    </div>
  );
}

export function GameTopMenu({
  userName,
  pets,
  selectedPetId,
  onSelectPet,
  onCreatePet,
  onInteract,
  onBack,
  maxRows = 10,
}: {
  userName: string;
  pets: Pet[];
  selectedPetId: string | null;
  onSelectPet: (petId: string) => void;
  onCreatePet: (type: PetType, name: string) => { ok: true } | { ok: false; error: string };
  onInteract: (petId: string) => void;
  onBack: () => void;
  maxRows?: number;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [newType, setNewType] = useState<PetType>("peyo");
  const [newName, setNewName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragY, setDragY] = useState<number>(0);
  const dragStartY = useRef<number | null>(null);

  const rows = useMemo(() => {
    const out: Array<Pet | null> = [];
    for (let i = 0; i < maxRows; i++) {
      const p = pets[i];
      out.push(p ?? null);
    }
    return out;
  }, [pets, maxRows]);

  function close() {
    setDragY(0);
    setOpen(false);
  }

  function isInteractiveTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button, input, select, textarea, a"));
  }

  function onPanelPointerDown(e: React.PointerEvent) {
    if (!open) return;
    if (isInteractiveTarget(e.target)) return;
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPanelPointerMove(e: React.PointerEvent) {
    if (!open) return;
    const start = dragStartY.current;
    if (start == null) return;
    const delta = e.clientY - start;
    const up = Math.min(0, delta);
    const clamped = Math.max(-140, up);
    setDragY(clamped);
  }

  function onPanelPointerUp() {
    if (!open) return;
    const shouldClose = dragY < -60;
    dragStartY.current = null;
    if (shouldClose) {
      close();
      return;
    }
    setDragY(0);
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-40">
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center pt-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDragY(0);
            setOpen((v) => !v);
          }}
          className="pointer-events-auto rounded-full border border-emerald-200 bg-emerald-700 px-4 py-2 text-sm font-medium text-emerald-50 shadow-sm hover:bg-emerald-600"
        >
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>

      <div
        className={
          "fixed inset-0 transition-opacity duration-200 " +
          (open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={close}
        aria-hidden={!open}
      >
        <div className="absolute inset-0 bg-emerald-950/30" />

        <div
          className="absolute left-1/2 top-0 w-[min(92vw,760px)] -translate-x-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={
              "mt-10 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm transition-transform duration-200 ease-out" +
              (open ? "" : "")
            }
            style={{
              transform: open
                ? `translateY(${dragY}px)`
                : "translateY(-110%)",
            }}
            onPointerDown={onPanelPointerDown}
            onPointerMove={onPanelPointerMove}
            onPointerUp={onPanelPointerUp}
            onPointerCancel={onPanelPointerUp}
          >
            <div className="flex items-center justify-between border-b border-emerald-200 px-4 py-3">
              <div className="text-sm font-semibold">Usuario: {userName}</div>
              <button
                type="button"
                onClick={onBack}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
              >
                Volver al menú
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold">Crear mascota</div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="h-10 rounded-md border border-emerald-300 bg-white px-2 text-sm"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as PetType)}
                    >
                      <option value="peyo">Peyo</option>
                      <option value="micha">Micha</option>
                      <option value="kiwi">Kiwi</option>
                    </select>
                    <input
                      className="h-10 flex-1 rounded-md border border-emerald-300 bg-white px-3 text-sm"
                      placeholder="Nombre de la mascota"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="h-10 rounded-md bg-emerald-700 px-3 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                      onClick={() => {
                        setError(null);
                        const res = onCreatePet(newType, newName);
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        setNewName("");
                      }}
                    >
                      Crear
                    </button>
                  </div>
                  {error ? (
                    <div className="text-sm text-red-700">{error}</div>
                  ) : null}
                  <div className="text-xs text-emerald-900/70">
                    Tip: desliza hacia arriba para cerrar.
                  </div>
                </div>

                <div className="text-sm font-semibold">Tus mascotas (2×5)</div>
                <div className="rounded-md border border-emerald-200 bg-white p-3">
                  <div className="grid grid-cols-5 gap-2">
                    {rows.map((pet, idx) => {
                      const empty = !pet;
                      const isSelected = pet ? pet.id === selectedPetId : false;
                      return (
                        <div
                          key={idx}
                          className={
                            "rounded-md border p-2 " +
                            (empty
                              ? "border-emerald-200 bg-white"
                              : isSelected
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-emerald-300 bg-emerald-50")
                          }
                        >
                          {pet ? (
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white p-1.5 text-left hover:bg-emerald-50"
                                onClick={() => onSelectPet(pet.id)}
                                title="Seleccionar mascota"
                              >
                                <div
                                  className="shrink-0 rounded border border-emerald-200 bg-white flex items-center justify-center overflow-hidden"
                                  style={{ width: 48, height: 48 }}
                                  aria-hidden="true"
                                >
                                  <div
                                    style={{
                                      width: 48,
                                      height: 48,
                                      backgroundImage: `url(${typeToSheet(pet.type)})`,
                                      backgroundRepeat: "no-repeat",
                                      backgroundSize: `${48 * 5}px ${48 * 5}px`,
                                      backgroundPosition: "0px 0px",
                                      imageRendering: "pixelated",
                                    }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold text-emerald-950">
                                    {pet.name}
                                  </div>
                                  <div className="text-[11px] text-emerald-950/70">
                                    {pet.type}
                                  </div>
                                  {isSelected ? (
                                    <div className="text-[11px] font-medium text-emerald-700">
                                      Seleccionada
                                    </div>
                                  ) : null}
                                </div>
                              </button>

                              <div className="flex flex-col gap-1 text-[11px] text-emerald-950">
                                <div className="flex items-center justify-between gap-2">
                                  <span>Energía</span>
                                  <span className="text-emerald-950/70">
                                    {Math.round(pet.energy)}
                                  </span>
                                </div>
                                <StatBar value={pet.energy} />

                                <div className="flex items-center justify-between gap-2">
                                  <span>Humor</span>
                                  <span className="text-emerald-950/70">
                                    {Math.round(pet.moodStat)}
                                  </span>
                                </div>
                                <StatBar value={pet.moodStat} />

                                <div className="flex items-center justify-between gap-2">
                                  <span>Hambre</span>
                                  <span className="text-emerald-950/70">
                                    {Math.round(pet.hunger)}
                                  </span>
                                </div>
                                <StatBar value={pet.hunger} />
                              </div>

                              <button
                                type="button"
                                className="mt-1 h-8 rounded-md border border-emerald-300 bg-white text-xs text-emerald-900 hover:bg-emerald-100"
                                onClick={() => onInteract(pet.id)}
                              >
                                Interactuar
                              </button>
                            </div>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-1 py-6">
                              <div className="text-xs text-emerald-950/40">Vacío</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
