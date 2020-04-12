// Ours
import * as t from './utils/types';
import * as o from './utils/operations';

import { pipe } from './utils/pipe';
import { createFetch } from './fetch';
import { Emitter } from './utils/emitter';
import { transition } from './utils/state';

export type Client = ReturnType<typeof createClient>;

export const createClient = (options: t.ClientOptions) => {
	//The heart of this whole thing.
	const events = Emitter();

	// tracks prefetched requests to avoid potential refetching.
	const prefetched = new Set<string>();

	// A key-value cache that maps requests to their state & data
	const store = new Map<string, { state: t.State; data?: any }>();

	/**
	 * Extracts operation key
	 *
	 * @param op
	 */
	const keyOf = (op: o.Operation) => {
		return op.payload.request.id;
	};

	/**
	 * updates store based on operation type and notify subscribers.
	 *
	 * @param op
	 */
	const update = (op: o.Operation) => {
		const key = keyOf(op);

		let { state, data } = store.get(key) || {};

		const next = transition(state, op);

		if (next === 'disposed') {
			store.delete(key);
			return;
		}

		if (op.type === 'put' || op.type === 'complete') {
			data = op.payload.data !== undefined ? op.payload.data : data;
		}

		store.set(key, { state: next, data });
		events.emit(key, op);
	};

	/**
	 * Compares the next state against the current state and pass
	 * the `op` through the pipeline if necessary.
	 *
	 * @param op
	 */
	const apply = (() => {
		const exchanges = options.exchanges || [];
		const fetchExchange = createFetch(options.handler);

		// Setup exchanges
		const api = { emit: update, store };
		const pipeThrough = pipe([...exchanges, fetchExchange], api);

		return (op: o.Operation) => {
			const current = store.get(keyOf(op))?.state;
			const next = transition(current, op);

			// Rule:
			// If it won't change the current state DO NOT do it.
			// The ONLY exception is buffering.
			if (current !== 'buffering' && next === current) {
				return;
			}

			pipeThrough(op);
		};
	})();

	/**
	 * Disposes unused requests. A request becomes unused if it had
	 * no listeners for `options.store.maxAge` period.
	 *
	 * @param eventState
	 */
	const garbage = (() => {
		// Holds result of setTimeout() calls
		const timers = new Map<string, any>();

		return (r: t.Request, dispose = true) => {
			if (dispose) {
				const collect = () => {
					apply(o.$dispose({ id: r.id }));
				};

				// schedule disposal
				const timeout = setTimeout(
					collect,
					options.store?.maxAge ?? 30 * 1000
				);

				timers.set(r.id, timeout);

				return;
			}

			// keep
			clearTimeout(timers.get(r.id));
			timers.delete(r.id);
		};
	})();

	/**
	 *
	 * @param request
	 * @param cb
	 */
	const fetch = (request: t.Request, cb?: t.Subscriber) => {
		const notify = (op: o.Operation) => {
			const { state, data } = store.get(request.id) || {};

			if (op.type === 'reject') {
				return cb(state, data, op.payload.error);
			}

			return cb(state, data);
		};

		if (cb) {
			// cancel disposal if scheduled
			garbage(request, false);

			events.on(request.id, notify);
		} else {
			// This is probably a prefetching case. Mark immediately as
			// inactive so that it will be disposed if not used.
			garbage(request);
		}

		const hasMore = () => {
			// Lazy streams don't go to "buffering" state but rather
			// got back to "ready".
			return store.get(request.id)?.state === 'ready';
		};

		const fetchMore = () => {
			if (hasMore()) {
				apply(o.$fetch(request));
			}
		};

		const cancel = () => {
			apply(o.$cancel(request));
		};

		const unsubscribe = () => {
			cb && events.off(request.id, notify);

			// cancel and schedule disposal if no longer needed
			if (!events.hasSubscribers(request.id)) {
				cancel();
				garbage(request);
			}
		};

		// The request might already be fetched via prefetch().
		const isPrefetched = prefetched.has(request.id);

		if (!isPrefetched) {
			apply(o.$fetch(request));
		} else {
			prefetched.delete(request.id);

			// Notify subscriber. The type of operation we use has no
			// effect unless it's "reject".
			const { data } = store.get(request.id) || {};
			notify(o.$put(request, data));
		}

		return {
			cancel,
			hasMore,
			fetchMore,
			unsubscribe,
		};
	};

	/**
	 *
	 * @param request
	 */
	const prefetch = (request: t.Request) => {
		if (!prefetched.has(request.id)) {
			fetch(request);

			// mark as prefetched
			prefetched.add(request.id);
		}
	};

	return { fetch, prefetch };
};
