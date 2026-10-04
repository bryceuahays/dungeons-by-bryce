'use client';
import { useState } from 'react';

// The DM's way into a player's sheet: read-only by default, with a switch to edit.
export function SheetAccess({ name, canEdit, children }: { name: string; canEdit: boolean; children: React.ReactNode }) {
  const [edit, setEdit] = useState(false);
  return (
    <>
      <p className="row">
        <span className="pillb dm">{edit ? 'Editing' : 'Read-only'}</span>
        {canEdit ? <label className="ck"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} /> Let me edit {name}&apos;s sheet</label> : null}
        {edit ? <span className="muted">Changes save straight to the player&apos;s sheet.</span> : null}
      </p>
      <fieldset className="plainset" disabled={!edit}>{children}</fieldset>
    </>
  );
}
