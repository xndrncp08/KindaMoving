import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
export const metadata = { title: 'Your account' };
export default function Page() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
