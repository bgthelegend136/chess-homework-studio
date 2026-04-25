import { requireCoach } from '@/lib/auth';
import { TopNav } from '@/components/nav/TopNav';

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const coach = await requireCoach();

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopNav email={coach.email} />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
