'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resourceSchemas, type Resource, type Shoe } from '@km/types';
import { Button, Input, ErrorState } from '@km/ui';
import { useRecordMutation } from '@/lib/queries';
import { useUnsaved } from './unsaved';
import { toast } from 'sonner';
const today = () => new Date().toLocaleDateString('en-CA');
const defaults = {
  activities: {
    title: '',
    started_at: today(),
    distance_m: 5000,
    elapsed_s: 1800,
    shoe_id: null,
  },
  routes: { title: '', description: '', distance_m: 0 },
  shoes: { title: '', brand: '', initial_distance_m: 0, retired: false },
  workouts: {
    title: '',
    description: '',
    scheduled_on: today(),
    completed: false,
  },
};
export function RecordForm({
  name,
  userId,
  record,
  onSaved,
  shoes = [],
}: {
  name: Resource;
  userId: string;
  record?: Record<string, unknown>;
  onSaved: () => void;
  shoes?: Shoe[];
}) {
  const schema = resourceSchemas[name] as z.ZodType<
    Record<string, unknown>,
    Record<string, unknown>
  >;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: (record || defaults[name]) as Record<string, unknown>,
  });
  const mutation = useRecordMutation(userId, name);
  // Imported activities keep file-derived measurements read-only (enforced in SQL too).
  const imported =
    name === 'activities' && !!record?.source && record.source !== 'manual';
  useUnsaved(isDirty);
  return (
    <form
      className="form-grid"
      onSubmit={handleSubmit((values) =>
        mutation.mutate(
          {
            method: record ? 'PATCH' : 'POST',
            data: { ...values, ...(record ? { id: record.id } : {}) },
          },
          {
            onSuccess: () => {
              reset(values);
              toast.success('Saved. A little progress.');
              onSaved();
            },
          },
        ),
      )}
    >
      <label className="full">
        Name
        <Input {...register('title')} />
      </label>
      {imported && (
        <p className="muted full">
          Distance, time and date come from the recorded file and stay read-only
          so splits, streams and shoe totals remain consistent.
        </p>
      )}
      {name === 'activities' && (
        <>
          <label hidden={imported}>
            Date
            <Input type="date" {...register('started_at')} />
          </label>
          <label hidden={imported}>
            Distance (metres)
            <Input
              type="number"
              min="1"
              max="500000"
              step="any"
              {...register('distance_m')}
            />
          </label>
          <label hidden={imported}>
            Elapsed time (seconds)
            <Input
              type="number"
              min="1"
              max="604800"
              {...register('elapsed_s')}
            />
          </label>
          <label>
            Shoes
            <select {...register('shoe_id', { setValueAs: (v) => v || null })}>
              <option value="">No shoe assigned</option>
              {shoes
                .filter((s) => !s.retired || s.id === record?.shoe_id)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                    {s.retired ? ' (retired)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {name === 'routes' && (
        <label>
          Distance (metres)
          <Input
            type="number"
            min="0"
            max="500000"
            {...register('distance_m')}
          />
        </label>
      )}
      {name === 'shoes' && (
        <>
          <label>
            Brand
            <Input {...register('brand')} />
          </label>
          <label>
            Distance before KindaMoving (metres)
            <Input
              type="number"
              min="0"
              max="10000000"
              {...register('initial_distance_m')}
            />
          </label>
          <label>
            <input type="checkbox" {...register('retired')} />
            Retired
          </label>
        </>
      )}
      {name === 'workouts' && (
        <>
          <label>
            Scheduled date
            <Input type="date" {...register('scheduled_on')} />
          </label>
          <label>
            <input type="checkbox" {...register('completed')} />
            Completed
          </label>
        </>
      )}
      {(name === 'routes' || name === 'workouts') && (
        <label className="full">
          Notes
          <textarea {...register('description')} />
        </label>
      )}
      {Object.entries(errors).map(([key, e]) => (
        <p key={key} className="field-error full" role="alert">
          {key}: {String(e?.message)}
        </p>
      ))}
      {mutation.error && (
        <div className="full">
          <ErrorState message={mutation.error.message} />
        </div>
      )}
      <div className="full">
        <Button disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
