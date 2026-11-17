// Setup open/closed state and what each part of the setup does in it. Pure: no DOM, no clock.

export interface SetupBodyState {
  /** The body is closed: the summary bar shows instead. */
  closed: boolean;
  /** The body is inert: nothing in it takes focus or clicks. */
  inert: boolean;
  /** The body is hidden from assistive tech. */
  ariaHidden: boolean;
  /** The summary bar shows (after a run, open or closed). */
  summaryShown: boolean;
  /** "Unleash gremlins" and the tries line show. */
  actionShown: boolean;
}

/**
 * `collapsed`: the phase collapsed the setup (after a run). `userOpen`: the user re-opened it with "Change
 * setup". A closed body takes no focus and is hidden from assistive tech; CSS gives it zero height, no
 * padding and no visibility (app.css, ".setup.is-collapsed").
 */
export function setupBodyState(collapsed: boolean, userOpen: boolean): SetupBodyState {
  const closed = collapsed && !userOpen;
  return { closed, inert: closed, ariaHidden: closed, summaryShown: collapsed, actionShown: !closed };
}
