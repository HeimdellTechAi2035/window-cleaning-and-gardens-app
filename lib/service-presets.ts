import { Droplets, Trees, type LucideIcon } from "lucide-react";

export interface ServicePreset {
  key: string;
  icon: LucideIcon;
  title: string;
  defaultPrice: string;
  defaultIntervalWeeks: string;
}

export const servicePresets: ServicePreset[] = [
  {
    key: "window-clean",
    icon: Droplets,
    title: "Window Cleaning",
    defaultPrice: "12.50",
    defaultIntervalWeeks: "4",
  },
  {
    key: "gardening",
    icon: Trees,
    title: "Gardening",
    defaultPrice: "25",
    defaultIntervalWeeks: "4",
  },
];
