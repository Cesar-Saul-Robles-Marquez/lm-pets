import type { Pet, PetMood } from "@/lib/types";

const FRAME_SIZE = 100;
const SHEET_SIZE = 500;

function moodToRow(mood: PetMood): number {
  switch (mood) {
    case "walk":
      return 0;
    case "happy":
      return 1;
    case "hungry":
      return 2;
    case "angry":
      return 3;
    case "sleep":
      return 4;
  }
}

function typeToSheet(type: Pet["type"]): string {
  switch (type) {
    case "peyo":
      return "/Recursos/SpriteSheets/PeyoSS.png";
    case "micha":
      return "/Recursos/SpriteSheets/MichaSS.png";
  }
}

export function PetSprite({
  pet,
  onClick,
}: {
  pet: Pet;
  onClick: () => void;
}) {
  const visualMood: PetMood = pet.hunger >= 50 ? "hungry" : pet.mood;
  const row = moodToRow(visualMood);

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute select-none"
      style={{
        left: pet.x,
        top: pet.y,
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        backgroundImage: `url(${typeToSheet(pet.type)})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${SHEET_SIZE}px ${SHEET_SIZE}px`,
        backgroundPositionY: `${-row * FRAME_SIZE}px`,
        animation: "lmPetsSpriteX 700ms steps(5) infinite",
        transform: pet.vx < 0 ? "scaleX(-1)" : undefined,
      }}
      aria-label={`Mascota ${pet.name}`}
      title={pet.name}
    />
  );
}
