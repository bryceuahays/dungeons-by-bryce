import { redirect } from 'next/navigation';

// The class import moved to Import homebrew, which imports every kind.
export default function ImportClass() {
  redirect('/homebrew/import?type=class');
}
