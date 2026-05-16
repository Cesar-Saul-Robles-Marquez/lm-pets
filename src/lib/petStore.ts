import type { Pet } from "@/lib/types";

type Listener = () => void;

class PetStore {
  private pets: Pet[] = [];
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.pets;

  setPets = (pets: Pet[]) => {
    this.pets = pets;
    this.emit();
  };

  update = (updater: (pets: Pet[]) => Pet[]) => {
    this.pets = updater(this.pets);
    this.emit();
  };

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const petStore = new PetStore();
