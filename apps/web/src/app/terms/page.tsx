import { Brand } from '@/components/brand';
export const metadata = { title: 'Terms' };
export default function Page() {
  return (
    <main id="main" className="legal">
      <Brand />
      <h1 style={{ marginTop: 40 }}>Terms</h1>
      <p className="eyebrow">Foundation release · October 31, 2026</p>
      <p>
        KindaMoving is an early running log and planning tool. It does not
        provide medical advice, guarantee route safety, or replace your judgment
        about weather, traffic, terrain, or training. Features described as
        planned are unavailable. You retain ownership of your records and must
        upload only files you are authorized to use. Keep your password secure.
        Availability is not guaranteed during development. Before public launch,
        the operator must add its legal identity, support contact, governing
        terms, and any applicable commercial policies.
      </p>
    </main>
  );
}
