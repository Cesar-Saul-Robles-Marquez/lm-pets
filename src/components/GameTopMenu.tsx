"use client";

import { useMemo, useRef, useState } from "react";
import type { Pet, PetType } from "@/lib/types";
import jsPDF from "jspdf";

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

function typeToLabel(type: Pet["type"]): string {
  switch (type) {
    case "peyo":
      return "Peyo";
    case "micha":
      return "Micha";
    case "kiwi":
      return "Kiwi";
  }
}

function formatBirthDate(epochMs: number | null | undefined): string {
  if (epochMs == null) return "—";
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function PetPhoto({ type, size }: { type: Pet["type"]; size: number }) {
  // First frame (0,0) from 5×5 spritesheet (100×100 frames).
  return (
    <div
      className="rounded border border-emerald-200 bg-white overflow-hidden"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${typeToSheet(type)})`,
          backgroundRepeat: "no-repeat",
          // Scale the sheet so a single frame fills the container.
          backgroundSize: `${size * 5}px ${size * 5}px`,
          backgroundPosition: "0px 0px",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
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
  onCreatePet: (type: PetType, name: string) =>
    | { ok: true; petId: string }
    | { ok: false; error: string };
  onInteract: (petId: string) => void;
  onBack: () => void;
  maxRows?: number;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [certificateOpen, setCertificateOpen] = useState<boolean>(false);
  const [certificatePetId, setCertificatePetId] = useState<string | null>(null);

  const petTypeOptions = useMemo(() => ["peyo", "micha", "kiwi"] as PetType[], []);
  const [createTypeIndex, setCreateTypeIndex] = useState<number>(0);
  const [newName, setNewName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragY, setDragY] = useState<number>(0);
  const dragStartY = useRef<number | null>(null);
  const certificateRef = useRef<HTMLDivElement | null>(null);

  const selectedCreateType = petTypeOptions[createTypeIndex] ?? "peyo";

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

  function closeCreate() {
    setCreateOpen(false);
    setError(null);
  }

  function openCertificateForPet(petId: string) {
    setCertificatePetId(petId);
    setCertificateOpen(true);
    setError(null);
  }

  const certificatePet = useMemo(() => {
    if (!certificatePetId) return null;
    return pets.find((p) => p.id === certificatePetId) ?? null;
  }, [certificatePetId, pets]);

  async function spritePhotoDataUrl(type: Pet["type"]) {
    const sheetUrl = typeToSheet(type);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = sheetUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo cargar el spritesheet"));
    });

    // Crop first 100×100 frame at (0,0) and scale up.
    const srcSize = 100;
    const outSize = 280;
    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, srcSize, srcSize, 0, 0, outSize, outSize);
    return canvas.toDataURL("image/png");
  }

  async function exportCertificatePdf() {
    const pet = certificatePet;
    if (!pet) return;

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Fondo y borde exterior
    pdf.setFillColor(251, 249, 241); // Cozy warm cream (Crema cálido)
    pdf.setDrawColor(135, 169, 142); // Sage green (Verde salvia)
    pdf.setLineWidth(10);
    pdf.roundedRect(20, 20, pageW - 40, pageH - 40, 15, 15, "FD");

    // Borde interior
    pdf.setDrawColor(186, 201, 180); // Soft pale olive (Verde oliva claro)
    pdf.setLineWidth(2);
    pdf.roundedRect(32, 32, pageW - 64, pageH - 64, 10, 10, "S");

    // Título principal
    pdf.setTextColor(60, 100, 75); // Deep cozy green (Verde profundo y cálido)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(36);
    pdf.text("Acta de Nacimiento", pageW / 2, 100, { align: "center" });

    // Subtítulo
    pdf.setTextColor(110, 120, 110);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(16);
    pdf.text("Este documento certifica oficialmente la adopción de:", pageW / 2, 140, { align: "center" });

    // Nombre de la mascota
    pdf.setTextColor(75, 130, 95); // Warm leaf green (Verde hoja cálido)
    pdf.setFont("times", "bolditalic");
    pdf.setFontSize(48);
    pdf.text(pet.name, pageW / 2, 200, { align: "center" });

    // Fotografía / Sprite
    try {
      const photo = await spritePhotoDataUrl(pet.type);
      const imgSize = 250;
      const imgX = (pageW - imgSize) / 2;
      const imgY = 230;
      pdf.addImage(photo, "PNG", imgX, imgY, imgSize, imgSize);
    } catch {
      // Si la imagen falla, continuamos
    }

    const bornAt = pet.birth?.bornAt;
    const dateStr = formatBirthDate(bornAt);
    const ownerStr = pet.birth?.owner?.trim() || userName.trim() || "—";

    // Información detallada
    const infoY = 530;
    const leftX = pageW / 2 - 10;
    const lineH = 30;

    pdf.setTextColor(80, 90, 80);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    
    // Etiquetas (Alineadas a la derecha)
    pdf.text("Especie:", leftX, infoY, { align: "right" });
    pdf.text("Fecha de adopción:", leftX, infoY + lineH, { align: "right" });
    pdf.text("Dueño responsable:", leftX, infoY + lineH * 2, { align: "right" });

    // Valores (Alineados a la izquierda)
    pdf.setFont("helvetica", "normal");
    pdf.text(` ${typeToLabel(pet.type)}`, leftX, infoY, { align: "left" });
    pdf.text(` ${dateStr}`, leftX, infoY + lineH, { align: "left" });
    pdf.text(` ${ownerStr}`, leftX, infoY + lineH * 2, { align: "left" });

    // Área de firma
    const sigY = 720;
    pdf.setDrawColor(140, 150, 140); // Gris verdoso para la línea
    pdf.setLineWidth(1);
    pdf.line(pageW / 2 - 120, sigY, pageW / 2 + 120, sigY);

    pdf.setTextColor(110, 120, 110);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(12);
    pdf.text("Firma del Dueño", pageW / 2, sigY + 20, { align: "center" });

    const safeName = pet.name.trim().replace(/\s+/g, " ") || "Mascota";
    pdf.save(`Acta-${safeName}.pdf`);
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
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCreateOpen(true);
                  }}
                  className="h-10 rounded-md bg-emerald-700 px-3 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                >
                  Crear mascota
                </button>

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

                              <button
                                type="button"
                                className="h-8 rounded-md bg-emerald-700 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                                onClick={() => openCertificateForPet(pet.id)}
                              >
                                Ver acta
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

      {/* Create pet toast */}
      <div
        className={
          "fixed inset-0 z-50 transition-opacity duration-200 " +
          (createOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={closeCreate}
        aria-hidden={!createOpen}
      >
        <div className="absolute inset-0 bg-emerald-950/30" />

        <div
          className="absolute left-1/2 top-1/2 w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-200 px-4 py-3">
              <div className="text-sm font-semibold">Crear mascota</div>
              <button
                type="button"
                onClick={closeCreate}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
              >
                Cerrar
              </button>
            </div>

            <div className="p-4">
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold">Elige especie</div>
                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateTypeIndex((i) => Math.max(0, i - 1))}
                      disabled={createTypeIndex <= 0}
                      className={
                        "h-10 w-10 rounded-md border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 " +
                        (createTypeIndex <= 0 ? "opacity-40" : "")
                      }
                      aria-label="Anterior"
                      title="Anterior"
                    >
                      ←
                    </button>

                    <div className="flex flex-col items-center gap-2">
                      <PetPhoto type={selectedCreateType} size={220} />
                      <div className="text-base font-semibold text-emerald-950">
                        {typeToLabel(selectedCreateType)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCreateTypeIndex((i) => Math.min(petTypeOptions.length - 1, i + 1))
                      }
                      disabled={createTypeIndex >= petTypeOptions.length - 1}
                      className={
                        "h-10 w-10 rounded-md border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 " +
                        (createTypeIndex >= petTypeOptions.length - 1 ? "opacity-40" : "")
                      }
                      aria-label="Siguiente"
                      title="Siguiente"
                    >
                      →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <input
                    className="h-10 rounded-md border border-emerald-300 bg-white px-3 text-sm"
                    placeholder="Nombre de la mascota"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                {error ? <div className="text-sm text-red-700">{error}</div> : null}

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
                    onClick={() => {
                      setError(null);
                      const res = onCreatePet(selectedCreateType, newName);
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      setNewName("");
                      setCreateOpen(false);
                      openCertificateForPet(res.petId);
                    }}
                  >
                    Crear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Birth certificate toast */}
      <div
        className={
          "fixed inset-0 z-50 transition-opacity duration-200 " +
          (certificateOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={() => setCertificateOpen(false)}
        aria-hidden={!certificateOpen}
      >
        <div className="absolute inset-0 bg-emerald-950/30" />

        <div
          className="absolute bottom-3 left-1/2 w-[min(92vw,760px)] -translate-x-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-200 px-4 py-3">
              <div className="text-sm font-semibold">Acta de nacimiento</div>
              <button
                type="button"
                onClick={() => setCertificateOpen(false)}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
              >
                Cerrar
              </button>
            </div>

            <div className="p-4">
              {certificatePet ? (
                <div className="flex flex-col gap-3">
                  <div
                    ref={certificateRef}
                    className="rounded-lg border border-emerald-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-emerald-950">Acta de nacimiento</div>
                        <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-emerald-950 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold">Especie:</span> {typeToLabel(certificatePet.type)}
                          </div>
                          <div>
                            <span className="font-semibold">Nombre:</span> {certificatePet.name}
                          </div>
                          <div>
                            <span className="font-semibold">Fecha:</span> {formatBirthDate(certificatePet.birth?.bornAt)}
                          </div>
                          <div>
                            <span className="font-semibold">Dueño:</span> {certificatePet.birth?.owner?.trim() ? certificatePet.birth.owner.trim() : userName || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <PetPhoto type={certificatePet.type} size={96} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="h-10 rounded-md border border-emerald-300 bg-white px-4 text-sm text-emerald-900 hover:bg-emerald-100"
                      onClick={exportCertificatePdf}
                    >
                      Exportar PDF
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-emerald-950/70">No se encontró la mascota.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
