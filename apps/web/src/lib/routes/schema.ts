import { z } from 'zod';
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);
/** Route generation request; mirrors the analytics service's RouteIn bounds. */
export const generateSchema = z
  .object({
    lat,
    lon,
    distance_m: z.number().min(1000).max(42195),
    tolerance: z.number().min(0.02).max(0.3).default(0.1),
    shape: z.enum(['loop', 'out_and_back']).default('loop'),
    tempo_m: z.number().min(400).max(21097).nullable().default(null),
    tempo_max_major: z.number().int().min(0).max(5).default(0),
    tempo_max_minor: z.number().int().min(0).max(20).default(2),
    elevation: z.enum(['any', 'flat', 'hilly']).default('any'),
    surface: z.enum(['any', 'paved', 'unpaved']).default('any'),
    prefer_lit: z.boolean().default(false),
    avoid_conditions: z.boolean().default(true),
  })
  .refine((v) => !v.tempo_m || v.tempo_m < v.distance_m, {
    message: 'Tempo must be shorter than the run.',
    path: ['tempo_m'],
  });
export type GenerateInput = z.infer<typeof generateSchema>;
export const lineString = z.object({
  type: z.literal('LineString'),
  coordinates: z
    .array(z.tuple([lon, lat]).rest(z.number()))
    .min(2)
    .max(20000),
});
export const waypoints = z.array(z.object({ lat, lon })).max(60);
