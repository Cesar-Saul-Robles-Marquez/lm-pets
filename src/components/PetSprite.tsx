import type { Pet, PetMood } from "@/lib/types";

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
    case "kiwi":
      return "/Recursos/SpriteSheets/Kiwi2wb.png?v=20260517c";
  }
}

function getSpriteConfig() {
  // All pets use 500×500 spritesheet with 5×5 grid = 100×100 per frame, 5 frames per mood
  return { 
    sheetWidth: 500, 
    sheetHeight: 500, 
    frameWidth: 100, 
    frameHeight: 100, 
    frames: 5
  };
}

export function PetSprite(props: {
  pet: Pet;
  onClick: () => void;
  zIndexOverride?: number;
  sleepingInBed?: boolean;
}) {
  const { pet, onClick, zIndexOverride } = props;
  const visualMood: PetMood = pet.mood === "sleep" ? "sleep" : pet.hunger >= 50 ? "hungry" : pet.mood;
  const row = moodToRow(visualMood);
  const { sheetWidth, sheetHeight, frameWidth, frameHeight, frames } = getSpriteConfig();
  const spriteScale = pet.type === "kiwi" ? 0.47 : 1;

  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${pet.x}px, ${pet.y}px, 0)`,
        transition: "transform 80ms linear",
        willChange: "transform",
        zIndex: zIndexOverride ?? Math.floor(pet.y),
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-center select-none focus:outline-none"
        style={{
          width: 100,
          height: 100,
          transform: pet.vx < 0 ? "scaleX(-1)" : "scaleX(1)",
        }}
        aria-label={`Mascota ${pet.name}`}
        title={pet.name}
      >
        <div
          style={{
            width: frameWidth,
            height: frameHeight,
            backgroundImage: `url(${typeToSheet(pet.type)})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
            backgroundPositionY: `${-row * frameHeight}px`,
            animation: `spriteAnim 700ms steps(${frames}) infinite`,
            "--anim-end": `${-frameWidth * frames}px`,
            transform: spriteScale !== 1 ? `scale(${spriteScale})` : undefined,
            transformOrigin: "50% 50%",
          } as React.CSSProperties}
        />
      </button>
    </div>
  );
}