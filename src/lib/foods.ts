import type { Pet, PetType } from "@/lib/types";

export type FoodId = "fish" | "water" | "seeds" | "corn";
export type FoodPreference = "love" | "like" | "hate";

export type Food = {
  id: FoodId;
  name: string;
  price: number; // LM Coins
  // Sprite atlas (food-sprites.png is a 2x2 grid)
  sprite: { col: 0 | 1; row: 0 | 1 };
};

export const FOOD_SPRITESHEET_URL = "/Recursos/Sprites/food-sprites.png";
export const FOOD_ATLAS_SIZE = 512;
export const FOOD_CELL_SIZE = 256;

export const FOODS: Food[] = [
  {
    id: "fish",
    name: "Lata de pescado",
    price: 15,
    sprite: { col: 0, row: 0 },
  },
  {
    id: "water",
    name: "Tazón de agua",
    price: 15,
    sprite: { col: 1, row: 0 },
  },
  {
    id: "seeds",
    name: "Pipas",
    price: 15,
    sprite: { col: 0, row: 1 },
  },
  {
    id: "corn",
    name: "Maíz crujiente",
    price: 15,
    sprite: { col: 1, row: 1 },
  },
];

const PREFERENCES: Record<PetType, Record<FoodId, FoodPreference>> = {
  peyo: {
    fish: "love",
    water: "like",
    seeds: "hate",
    corn: "love",
  },
  micha: {
    fish: "love",
    water: "like",
    seeds: "like",
    corn: "hate",
  },
  kiwi: {
    fish: "hate",
    water: "love",
    seeds: "like",
    corn: "hate",
  },
};

export function getFoodPreference(petType: PetType, foodId: FoodId): FoodPreference {
  return PREFERENCES[petType][foodId];
}

export function feedPetWithFood(pet: Pet, foodId: FoodId): Pet {
  const pref = getFoodPreference(pet.type, foodId);

  let hungerDelta = 0;
  let moodDelta = 0;

  switch (pref) {
    case "love":
      hungerDelta = -50;
      moodDelta = +10;
      break;
    case "like":
      hungerDelta = -30;
      moodDelta = 0;
      break;
    case "hate":
      hungerDelta = -10;
      moodDelta = -10;
      break;
  }

  const nextHunger = clampNumber((pet.hunger ?? 0) + hungerDelta, 0, 100);
  const nextMoodStat = clampNumber((pet.moodStat ?? 70) + moodDelta, 0, 100);

  return {
    ...pet,
    hunger: nextHunger,
    moodStat: nextMoodStat,
  };
}

function clampNumber(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
