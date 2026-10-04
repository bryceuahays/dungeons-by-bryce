import { redirect } from 'next/navigation';
import { getDemo } from '@/lib/demo';

export default async function Demo() {
  const ctx = await getDemo();
  if (ctx?.sections[0]) redirect('/demo/' + ctx.sections[0].slug);
  return null;
}
