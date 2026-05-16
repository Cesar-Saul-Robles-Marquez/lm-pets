export type PetType = "peyo" | "micha";
export type PetMood = "walk" | "happy" | "hungry" | "sleep" | "angry";

export type Pet = {
  id: string;
  type: PetType;
  name: string;
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
