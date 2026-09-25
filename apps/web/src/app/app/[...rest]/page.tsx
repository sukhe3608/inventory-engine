import { redirect } from 'next/navigation';

export default function AppCatchAll() {
  redirect('/dashboard');
}