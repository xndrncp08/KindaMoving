/** Query keys shared by client hooks and server prefetching (same shape on both sides). */
export const keys = {
  user: (id: string) => ['user', id] as const,
  resource: (id: string, name: string) => ['user', id, name] as const,
};
