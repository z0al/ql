// Ours
import {
	Operation,
	$fetch,
	$cancel,
	$dispose,
} from './utils/operations';
import { pipe } from './utils/pipe';
import { Request } from './request';
import { transition, State } from './utils/state';
import { createFetch, FetchHandler } from './fetch';
import { Emitter, TrackerFunc } from './utils/emitter';
import { Exchange, EmitFunc, ExchangeAPI, Cache } from './utils/types';

export interface GCOptions {
	// Max age for inactive queries. Default is 30 seconds.
	maxAge?: number;
}

export interface ClientOptions {
	handler: FetchHandler;
	gc?: GCOptions;
	exchanges?: Array<Exchange>;
}

export type Subscriber = (state: State, data: any, err?: any) => void;

export type Client = ReturnType<typeof createClient>;

export const createClient = (options: ClientOptions) => {
	// A simple key-value cache. It uses the request ID as a key.
	const cacheMap = new Map<string, any>();

	// Holds the state of all requests.
	const stateMap = new Map<string, State>();

	// Keeps track of inactive queries (i.e. no subscribers) so they
	// can be disposed later (see .dispose()). The value here is the
	// value returned by `setTimeout()`.
	const inactiveMap = new Map<string, any>();

	// We rely on this emitter for everything. In fact, Client is just
	// a wrapper around it.
	let track: TrackerFunc;
	const events = Emitter(e => track(e));

	/**
	 * Extracts operation key
	 *
	 * @param op
	 */
	const keyOf = (op: Operation) => {
		return op.payload.request.id;
	};

	/**
	 * Emits an event of type `request.id` and `op` as a payload
	 *
	 * @param op
	 */
	const emit: EmitFunc = (op: Operation) => {
		const key = keyOf(op);

		// Update cache if necessary
		if (op.type === 'buffer' || op.type === 'complete') {
			if (op.payload.data !== undefined) {
				cacheMap.set(key, op.payload.data);
			}
		}

		const next = transition(stateMap.get(key), op);

		if (next !== 'disposed') {
			stateMap.set(key, next);
			events.emit(key, op);
		} else {
			// Clean-up
			stateMap.delete(key);
			cacheMap.delete(key);
		}
	};

	/**
	 * Compares the next state against the current state and pass
	 * the `op` through the pipeline if necessary.
	 *
	 * @param op
	 */
	const apply: EmitFunc = (() => {
		const exchanges = options.exchanges || [];
		const fetchExchange = createFetch(options.handler);

		const cache: Cache = {
			has: cacheMap.has.bind(cacheMap),
			get: cacheMap.get.bind(cacheMap),
			keys: cacheMap.keys.bind(cacheMap),
			values: cacheMap.values.bind(cacheMap),
			entries: cacheMap.entries.bind(cacheMap),
		};

		// Setup exchanges
		const api: ExchangeAPI = { emit, cache };
		const pipeThrough = pipe([...exchanges, fetchExchange], api);

		return (op: Operation) => {
			const current = stateMap.get(keyOf(op));
			const next = transition(current, op);

			// Rule:
			// If it won't change the current state DO NOT do it.
			// The ONLY exception is streaming.
			if (current !== 'streaming' && next === current) {
				return;
			}

			pipeThrough(op);
		};
	})();

	/**
	 * Disposes inactive requests. A request becomes inactive when
	 * it has no listeners.
	 *
	 * @param eventState
	 */
	track = ({ type, state }) => {
		// We use request id as event type
		const id = type;

		if (state === 'active') {
			clearTimeout(inactiveMap.get(id));
			inactiveMap.delete(id);
		}

		if (state === 'inactive') {
			inactiveMap.set(
				id,
				setTimeout(() => {
					apply($dispose({ id }));
				}, options.gc?.maxAge ?? 30 * 1000)
			);
		}
	};

	/**
	 *
	 * @param req
	 * @param cb
	 */
	const fetch = (req: Request, cb?: Subscriber) => {
		const notify = (op: Operation) => {
			const state = stateMap.get(req.id);
			const data = cacheMap.get(req.id);

			if (op.type === 'reject') {
				return cb(state, data, op.payload.error);
			}

			return cb(state, data);
		};

		if (cb) {
			events.on(req.id, notify);
		} else {
			// This is probably a prefetching case. Mark immediately as
			// inactive so that it will be disposed if not used.
			track({ type: req.id, state: 'inactive' });
		}

		const hasMore = () => {
			// Lazy streams don't go to "streaming" state but rather
			// got back to "ready".
			return stateMap.get(req.id) === 'ready';
		};

		const fetchMore = () => {
			if (hasMore()) {
				apply($fetch(req));
			}
		};

		const cancel = () => {
			apply($cancel(req));
		};

		const unsubscribe = () => {
			cb && events.off(req.id, notify);

			// Cancel if running but no longer needed
			if (
				(stateMap.get(req.id) === 'pending' ||
					stateMap.get(req.id) === 'streaming') &&
				events.listenerCount(req.id) === 0
			) {
				cancel();
			}
		};

		// Perform fetch
		apply($fetch(req));

		return {
			cancel,
			hasMore,
			fetchMore,
			unsubscribe,
		};
	};

	/**
	 *
	 * @param req
	 */
	const prefetch = (req: Request) => {
		fetch(req);
	};

	return { fetch, prefetch };
};
