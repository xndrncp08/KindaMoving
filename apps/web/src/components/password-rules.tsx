import { Check, Circle } from 'lucide-react';
import { passwordRules } from '@/lib/password';
/** Live checklist under a new password; each rule turns green once met. */
export function PasswordRules({
  id,
  password,
  confirm,
}: {
  id: string;
  password: string;
  confirm?: string;
}) {
  const rules = passwordRules.map((r) => ({
    label: r.label,
    met: r.test(password),
  }));
  if (confirm !== undefined)
    rules.push({
      label: 'Passwords match',
      met: password.length > 0 && password === confirm,
    });
  return (
    <ul id={id} className="password-rules">
      {rules.map((r) => (
        <li key={r.label} className={r.met ? 'met' : undefined}>
          {r.met ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
          {r.label}
          <span className="sr-only">{r.met ? ' (met)' : ' (not yet)'}</span>
        </li>
      ))}
    </ul>
  );
}
