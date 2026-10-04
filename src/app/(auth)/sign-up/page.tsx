import { AuthForm } from '../AuthForm';

export const metadata = { title: 'Create an account' };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="up" next={next} />;
}
