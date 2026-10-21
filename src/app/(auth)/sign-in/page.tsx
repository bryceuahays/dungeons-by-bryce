import { AuthForm } from '../AuthForm';
import { enabledProviders } from '@/features/sign-in-with/providers';

export const metadata = { title: 'Sign in' };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <AuthForm mode="in" next={next} providers={await enabledProviders()} error={error?.slice(0, 200)} />;
}
