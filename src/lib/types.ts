export type PetType = "peyo" | "micha" | "kiwi";
export type PetMood = "walk" | "happy" | "hungry" | "sleep" | "angry";

export type BirthCertificate = {
  bornAt: number; // epoch ms
  owner: string;
};

export type BedColor =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11;

export type Bed = {
  id: string;
  // World-space coordinates (same space as pet.x/pet.y). Null = not placed yet.
  x: number | null;
  y: number | null;
  ownerPetId: string | null;
  color: BedColor;
};

export type Pet = {
  id: string;
  type: PetType;
  name: string;
  birth?: BirthCertificate;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Classic stats (0-100)
  energy: number;
  moodStat: number; // "humor" (happiness)
  hunger: number; // "hambre" (higher = more hungry)
  mood: PetMood;
  moodUntil?: number; // epoch ms
};
