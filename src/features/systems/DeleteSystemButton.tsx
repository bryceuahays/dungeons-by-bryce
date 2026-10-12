'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmButton } from '@/components/ConfirmButton';
import { deleteSystem } from './actions';

// Deleting a system: the campaigns that played it go back to its ready-made rules.
export function DeleteSystemButton({ id, name, used }: { id: string; name: string; used: number }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  return (
    <>
      <ConfirmButton className="quiet small-btn" yes="Delete" ask={`Delete ${name}?${used ? ` ${used} ${used === 1 ? 'campaign goes' : 'campaigns go'} back to the ready-made rules.` : ''}`}
        onConfirm={async () => { const r = await deleteSystem(id); if (r.error) setErr(r.error); else router.refresh(); }}>Delete</ConfirmButton>
      {err ? <span className="sm-err">{err}</span> : null}
    </>
  );
}
