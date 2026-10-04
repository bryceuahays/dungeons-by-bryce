import Link from 'next/link';
import { getPlan } from '@/lib/entitlements';
import { Converter } from '@/components/BrewForms';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'Edition converter' };

export default async function Convert() {
  const plan = await getPlan();
  return (
    <>
      <h1>Edition converter</h1>
      <p><Link className="button quiet" href="/homebrew">All my homebrew</Link></p>
      {plan.pro ? <Converter /> : <UpgradeHint feature="homebrew_full" />}
    </>
  );
}
