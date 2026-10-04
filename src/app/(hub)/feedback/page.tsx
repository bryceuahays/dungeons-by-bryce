import { requireViewer } from '@/lib/auth';
import { FeedbackForm } from '@/components/HubForms';

export const metadata = { title: 'Feedback' };

export default async function Feedback() {
  await requireViewer();
  return (
    <>
      <h1>Feedback</h1>
      <div className="panel narrow">
        <p className="dim">Is there something you wish this site could do? Something confusing or broken? Write it here. Your note goes to Bryce, with your name so he can reply.</p>
        <FeedbackForm />
      </div>
    </>
  );
}
