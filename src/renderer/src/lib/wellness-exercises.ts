import { Eye, Wind, PersonStanding, Hand, RotateCw, Armchair, Footprints } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** A single guided micro-break the user performs during a wellness break. */
export interface WellnessExercise {
  id: string;
  /** Short title shown large on the break overlay. */
  title: string;
  /** One- or two-sentence instruction. */
  instruction: string;
  /** Which body area this targets — shown as a small label. */
  group: 'Eyes' | 'Body';
  icon: LucideIcon;
}

/**
 * The built-in rotation of stretch / eye-rest exercises. Users pick which of these are
 * in their rotation; the overlay cycles through the selected ones, one per break.
 */
export const WELLNESS_EXERCISES: WellnessExercise[] = [
  {
    id: 'eyes-2020',
    title: '20-20-20 Eye Rest',
    instruction: 'Look at something about 20 feet away for 20 seconds. Blink slowly a few times to re-wet your eyes.',
    group: 'Eyes',
    icon: Eye,
  },
  {
    id: 'palming',
    title: 'Palm Your Eyes',
    instruction: 'Rub your palms together until warm, then cup them gently over closed eyes. Breathe and let the darkness rest them.',
    group: 'Eyes',
    icon: Eye,
  },
  {
    id: 'neck-rolls',
    title: 'Neck Rolls',
    instruction: 'Drop your chin to your chest and slowly roll your head in a circle. Five times each direction.',
    group: 'Body',
    icon: RotateCw,
  },
  {
    id: 'shoulder-rolls',
    title: 'Shoulder Rolls',
    instruction: 'Roll your shoulders backward ten times, then forward ten times. Let them drop away from your ears.',
    group: 'Body',
    icon: RotateCw,
  },
  {
    id: 'stand-reach',
    title: 'Stand & Reach',
    instruction: 'Stand up, reach both arms overhead, and stretch tall. Rise onto your toes if you can.',
    group: 'Body',
    icon: PersonStanding,
  },
  {
    id: 'wrist-stretch',
    title: 'Wrist & Finger Stretch',
    instruction: 'Extend one arm, palm up, and gently pull the fingers back with the other hand. Hold 15 seconds per side.',
    group: 'Body',
    icon: Hand,
  },
  {
    id: 'seated-twist',
    title: 'Seated Twist',
    instruction: 'Sit tall, place a hand on the chair back, and gently twist toward it. Hold, breathe, then switch sides.',
    group: 'Body',
    icon: Armchair,
  },
  {
    id: 'walk',
    title: 'Take a Short Walk',
    instruction: 'Stand and walk around for the break — to a window, the kitchen, anywhere. Let your legs move.',
    group: 'Body',
    icon: Footprints,
  },
  {
    id: 'breathe',
    title: 'Box Breathing',
    instruction: 'Inhale for 4 seconds, hold for 4, exhale for 6. Repeat until the timer ends.',
    group: 'Body',
    icon: Wind,
  },
];

export const ALL_EXERCISE_IDS = WELLNESS_EXERCISES.map((e) => e.id);

export function exerciseById(id: string): WellnessExercise | undefined {
  return WELLNESS_EXERCISES.find((e) => e.id === id);
}
