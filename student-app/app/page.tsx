import { redirect } from 'next/navigation';

export default function Home() {
  // Auth wiring lands in U29b; for now the portal entry is the login page.
  redirect('/login');
}
