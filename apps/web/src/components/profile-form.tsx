'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type Profile } from '@km/types';
import { Button, Input, ErrorState, Skeleton } from '@km/ui';
import { api, keys, profileQuery } from '@/lib/queries';
import { toast } from 'sonner';
import { useUnsaved } from './unsaved';
import { usePreferences } from '@/lib/stores';
import { useTheme } from 'next-themes';
const raceLabels = {
  '5k': '5K',
  '10k': '10K',
  half: 'Half marathon',
  marathon: 'Marathon',
  other: 'Other',
};
const fieldLabels: Record<string, string> = {
  preferred_name: 'Preferred name',
  country: 'Country',
  city: 'City',
  weekly_distance_m: 'Weekly distance goal',
  goals: 'Running goals',
};
export function ProfileForm({
  userId,
  onboarding = false,
}: {
  userId: string;
  onboarding?: boolean;
}) {
  const query = useQuery(profileQuery(userId));
  if (query.isPending) return <Skeleton />;
  if (query.error)
    return (
      <ErrorState
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    );
  return (
    <Editor userId={userId} profile={query.data} onboarding={onboarding} />
  );
}
function Editor({
  userId,
  profile,
  onboarding,
}: {
  userId: string;
  profile: Profile | null;
  onboarding: boolean;
}) {
  const client = useQueryClient();
  const { theme, setTheme } = useTheme();
  const compact = usePreferences((s) => s.compact);
  const setCompact = usePreferences((s) => s.setCompact);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: profile || {
      preferred_name: '',
      country: '',
      city: '',
      units: 'metric',
      experience: 'new',
      weekly_distance_m: 0,
      race_distance: '5k',
      goals: '',
      private_profile: true,
      notifications: false,
    },
  });
  useUnsaved(isDirty);
  const imperial = watch('units') === 'imperial';
  const factor = imperial ? 1609.344 : 1000;
  const goalM = Number(watch('weekly_distance_m') || 0);
  const [goalText, setGoalText] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (values: unknown) =>
      api('profile', { method: 'PUT', body: JSON.stringify(values) }),
    onSuccess: async (_, values) => {
      reset(values as Profile);
      await client.invalidateQueries({
        queryKey: keys.resource(userId, 'profile'),
      });
      toast.success('Profile saved.');
      if (onboarding) location.assign('/app');
    },
  });
  return (
    <div className="stack">
      <form
        className="form-grid"
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
      >
        <label>
          Preferred name
          <Input
            autoComplete="given-name"
            enterKeyHint="next"
            {...register('preferred_name')}
          />
        </label>
        {!onboarding && (
          <>
            <label>
              Country
              <Input autoComplete="country-name" {...register('country')} />
            </label>
            <label>
              City
              <Input autoComplete="address-level2" {...register('city')} />
            </label>
          </>
        )}
        <label>
          Measurement units
          <select {...register('units')}>
            <option value="metric">Kilometres</option>
            <option value="imperial">Miles</option>
          </select>
        </label>
        <label>
          Running experience
          <select {...register('experience')}>
            <option value="new">Finding my feet</option>
            <option value="regular">Regular runner</option>
            <option value="experienced">Experienced runner</option>
          </select>
        </label>
        <label>
          Weekly distance goal ({imperial ? 'mi' : 'km'})
          {/* Stored in metres; runners think in their own units. The text is
              local while typing so "12." isn't rewritten mid-entry. */}
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            autoComplete="off"
            value={
              goalText ??
              (goalM ? String(Math.round((goalM / factor) * 10) / 10) : '')
            }
            onChange={(e) => {
              setGoalText(e.target.value);
              setValue(
                'weekly_distance_m',
                Math.round(Number(e.target.value || 0) * factor),
                { shouldDirty: true, shouldValidate: true },
              );
            }}
            onBlur={() => setGoalText(null)}
          />
        </label>
        <label>
          Preferred race distance
          <select {...register('race_distance')}>
            {Object.entries(raceLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {/* Onboarding asks only what shapes the first screens; the rest keeps its defaults until Settings. */}
        {!onboarding && (
          <>
            <label className="full">
              Personal running goals
              <textarea {...register('goals')} />
            </label>
            <label>
              <input type="checkbox" {...register('private_profile')} />
              Keep profile private
            </label>
            <label>
              <input type="checkbox" {...register('notifications')} />
              Email notifications preference (delivery planned)
            </label>
          </>
        )}
        <p className="muted full">
          All running records are private to your account. Nothing is shared
          publicly.
        </p>
        {Object.entries(errors).map(([key, e]) => (
          <p className="field-error full" role="alert" key={key}>
            {fieldLabels[key] ?? key}: {e.message}
          </p>
        ))}
        {mutation.error && <ErrorState message={mutation.error.message} />}
        <div className="full">
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending
              ? 'Saving…'
              : onboarding
                ? 'Let’s get moving'
                : 'Save preferences'}
          </Button>
        </div>
      </form>
      {!onboarding && (
        <section className="settings-subsection">
          <h3>On this device</h3>
          <div className="form-grid">
            <label>
              Theme
              <select
                value={theme || 'system'}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              Compact activity list
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
