export function TutorialOverlay({
  open,
  step,
  onSkip,
  onNext,
}: {
  open: boolean;
  step: number;
  onSkip: () => void;
  onNext: () => void;
}) {
  if (!open) return null;

  const steps = [
    {
      title: "Tutorial (1/3)",
      body: "Abre el menú superior y crea tu primera mascota (Peyo o Micha).",
    },
    {
      title: "Tutorial (2/3)",
      body: "Haz click en una mascota para interactuar (se pondrá feliz).",
    },
    {
      title: "Tutorial (3/3)",
      body: "En la cuadrícula 2×5 puedes ver el sprite y stats de tus mascotas.",
    },
  ];

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/30 p-6">
      <div className="w-full max-w-lg rounded-xl border border-emerald-200 bg-white p-5 text-emerald-950 shadow-sm">
        <div className="text-lg font-semibold">{current.title}</div>
        <div className="mt-2 text-sm text-emerald-950/70">{current.body}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 hover:bg-emerald-50"
          >
            Saltar
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
          >
            {isLast ? "Terminar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
