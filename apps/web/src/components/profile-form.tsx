'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type Profile } from '@km/types';
import { Button, Input, ErrorState, Skeleton, Card } from '@km/ui';
import { api, keys, profileQuery } from '@/lib/queries';
import { toast } from 'sonner';
import { useUnsaved } from './unsaved';
import { usePreferences } from '@/lib/stores';
import { useTheme } from 'next-themes';
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
          <Input {...register('preferred_name')} />
        </label>
        <label>
          Country
          <Input autoComplete="country-name" {...register('country')} />
        </label>
        <label>
          City
          <Input autoComplete="address-level2" {...register('city')} />
        </label>
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
          Weekly distance goal (metres)
          <Input
            type="number"
            min="0"
            max="500000"
            {...register('weekly_distance_m')}
          />
        </label>
        <label>
          Preferred race distance
          <select {...register('race_distance')}>
            {['5k', '10k', 'half', 'marathon', 'other'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
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
        <p className="muted full">
          All running records are private to your account. Nothing is shared
          publicly.
        </p>
        {Object.entries(errors).map(([key, e]) => (
          <p className="field-error full" role="alert" key={key}>
            {key}: {e.message}
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
        <Card>
          <h2>On this device</h2>
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
        </Card>
      )}
    </div>
  );
}
