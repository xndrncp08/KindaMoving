'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const variants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      outline: 'button-outline',
      ghost: 'button-ghost',
      destructive: 'button-danger',
    },
  },
  defaultVariants: { variant: 'default' },
});
/** shadcn/ui composition: Radix behavior, CVA variants, application-owned styles. */
export function Button({
  asChild,
  variant,
  className,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(variants({ variant }), className)} {...props} />;
}
export function Input(props: React.ComponentProps<'input'>) {
  return <input {...props} className={cn('input', props.className)} />;
}
export function Card(props: React.ComponentProps<'section'>) {
  return <section {...props} className={cn('card', props.className)} />;
}
export type ProvenanceKind = 'measured' | 'estimated' | 'inferred';
const provenanceText: Record<ProvenanceKind, string> = {
  measured: 'Measured',
  estimated: 'Estimated',
  inferred: 'Inferred',
};
/** How far a number can be trusted: recorded by a sensor, modelled, or deduced from context. */
export function Provenance({ kind }: { kind: ProvenanceKind }) {
  return <span className={`prov prov-${kind}`}>{provenanceText[kind]}</span>;
}
export function Metric({
  label,
  value,
  unit,
  detail,
  provenance,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: React.ReactNode;
  provenance?: ProvenanceKind;
}) {
  return (
    <Card>
      <div className="row between">
        <p className="eyebrow">{label}</p>
        {provenance && <Provenance kind={provenance} />}
      </div>
      <p className="metric">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </p>
      {detail && <p className="muted">{detail}</p>}
    </Card>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error">
      <p>{message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading records" />
  );
}
export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Dialog({
  title,
  description,
  children,
  open,
  onOpenChange,
  drawer = false,
  sheet = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  drawer?: boolean;
  /** Bottom sheet (mobile). */
  sheet?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="overlay" />
        <DialogPrimitive.Content
          className={cn('dialog', drawer && 'drawer', sheet && 'sheet')}
        >
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="muted">
            {description}
          </DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close asChild>
            <Button variant="outline">Close</Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
/** In-app confirmation for destructive actions (replaces blocking window.confirm). */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  variant = 'ghost',
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: VariantProps<typeof variants>['variant'];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Dialog
        title={title}
        description={description}
        open={open}
        onOpenChange={setOpen}
      >
        <Button
          variant="destructive"
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </Dialog>
    </>
  );
}
export const Tabs = TabsPrimitive.Root;
export const TabsList = TabsPrimitive.List;
export const TabsTrigger = TabsPrimitive.Trigger;
export const TabsContent = TabsPrimitive.Content;
export function ActivityCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3>{title}</h3>
      {children}
    </Card>
  );
}
export const WorkoutCard = ActivityCard;
export function MapContainer({ children }: { children: React.ReactNode }) {
  return <div className="map-container">{children}</div>;
}
