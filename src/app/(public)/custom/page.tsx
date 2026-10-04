import { COMMISSION_TIERS } from '@/config/commissions';
import { CommissionForm } from '@/components/CommissionForm';

export const metadata = { title: 'Custom campaign sites', description: 'Have your campaign set up for you on Dungeons by Bryce, with a theme made from your own material.', robots: { index: true, follow: true } };

export default function Custom() {
  return (
    <>
      <h1>Custom campaign sites</h1>
      <div className="panel"><p>Send me your notes, your world and your references. I build your campaign here, with a look made for it, and hand it over to your account so you run it and own it.</p></div>
      <div className="plans">
        {COMMISSION_TIERS.map((t) => (
          <section key={t.id} className="panel plan" aria-label={t.name}>
            <h2>{t.name}</h2>
            <p className="price">{t.price}</p>
            <p>{t.what}</p>
          </section>
        ))}
      </div>
      <h2>Tell me about your campaign</h2>
      <div className="panel"><CommissionForm /></div>
    </>
  );
}
