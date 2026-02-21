import { redirect } from 'next/navigation';

export default function Home() {
  // Simple redirect to the dashboard. Middleware will handle auth protection.
  redirect('/dashboard');
}
