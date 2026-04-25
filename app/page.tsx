import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth';

export default async function RootPage() {
  const user = await getOptionalUser();
  if (user) redirect('/dashboard');
  redirect('/login');
}
