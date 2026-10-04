import Link from 'next/link';
import { FOUNDER, PLAN_COPY, type PlanId } from '@/config/plans';
import { CheckoutButton } from './BillingButtons';

// The three plans, written from src/config/plans.ts. `signedIn` adds the buy buttons.
export function PlanCards({ signedIn, seatsLeft, current }: { signedIn: boolean; seatsLeft: number; current?: PlanId }) {
  const ids: PlanId[] = FOUNDER.on ? ['free', 'pro', 'founder'] : ['free', 'pro'];
  return (
    <div className="plans">
      {ids.map((id) => {
        const p = PLAN_COPY[id];
        return (
          <section key={id} className={'panel plan' + (current === id ? ' current' : '')} aria-label={p.name}>
            <h2>{p.name}</h2>
            <p className="price">{p.price}</p>
            <p className="dim">{p.pitch}</p>
            <ul className="plain">{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
            {id === 'founder' ? <p className="seats" role="status">{seatsLeft > 0 ? `${seatsLeft} of ${FOUNDER.cap} seats left` : 'All seats are taken'}</p> : null}
            {current === id ? <p className="good">This is your plan.</p> : null}
            {!signedIn && id === 'free' ? <p><Link className="button" href="/sign-up">Start free</Link></p> : null}
            {!signedIn && id !== 'free' ? <p><Link className="button quiet" href="/sign-up?next=/upgrade">Create an account first</Link></p> : null}
            {signedIn && id === 'pro' && current === 'free' ? <div className="inline"><CheckoutButton kind="pro_monthly" label="Go Pro monthly" /><CheckoutButton kind="pro_yearly" label="Go Pro yearly" /></div> : null}
            {signedIn && id === 'founder' && current !== 'founder' && seatsLeft > 0 ? <CheckoutButton kind="founder" label="Become a founder" /> : null}
          </section>
        );
      })}
    </div>
  );
}
