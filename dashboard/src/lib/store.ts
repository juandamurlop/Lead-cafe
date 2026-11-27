export type Listener<S> = (state: S) => void;

export class Store<S extends object> {
  private state: S;
  private listeners = new Set<Listener<S>>();

  constructor(initial: S) {
    this.state = initial;
  }

  get(): Readonly<S> {
    return this.state;
  }

  set(patch: Partial<S> | ((s: Readonly<S>) => Partial<S>)): void {
    const delta = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...delta };
    for (const l of this.listeners) l(this.state);
  }

  subscribe(l: Listener<S>): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}
