'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@km/ui';
/** Password input with a show/hide toggle. The toggle sits outside the label so it never joins the input's accessible name. */
export function PasswordField({
  label,
  ...props
}: { label: string } & React.ComponentProps<'input'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-field">
      <label>
        {label}
        <Input
          {...props}
          type={shown ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <button
        type="button"
        className="password-toggle"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
