import Link from 'next/link';
import { NewOpeningForm } from './NewOpeningForm';

export default function NewOpeningPage() {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="mb-6 text-sm text-stone-500">
        <Link href="/openings" className="hover:text-stone-800">
          Openings
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-800">New</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">
          New opening repertoire
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Paste one repertoire PGN and train the moves for your chosen side.
        </p>
      </div>

      <NewOpeningForm />
    </div>
  );
}
