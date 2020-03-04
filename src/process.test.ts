// Packages
import { channel } from 'redux-saga';
import * as effects from 'redux-saga/effects';

// Ours
import { main, fetch } from './process';
import { createRequest } from './utils/request';

describe('main', () => {
	let config: any, pattern: any, events: any, event: any;

	beforeEach(() => {
		config = { resolver: jest.fn() };
		pattern = effects.actionChannel('@fetch');
		events = channel();

		event = {
			type: '@fetch' as any,
			data: {
				req: createRequest({ type: 'query', query: 'test' }),
			},
		};
	});

	test('should listen to fetch events', () => {
		const itr = main(config);

		// Steps
		// 1. create a channel
		expect(itr.next().value).toEqual(pattern);
		// 2. listen for events
		expect(itr.next(events).value).toEqual(effects.take(events));
	});

	test('should call the resolver with the request', () => {
		const itr = main(config);

		// Steps
		// 1. create a channel
		itr.next();
		// 2. listen for events
		itr.next(events);
		// 3. Receive an event
		expect(itr.next(event).value).toEqual(
			effects.call(config.resolver, event.data.req)
		);
	});

	test('should spawn a fetch call', () => {
		const itr = main(config);
		const fn = jest.fn();

		// Steps
		// 1. create a channel
		itr.next();
		// 2. listen for events
		itr.next(events);
		// 3. Receive an event
		itr.next(event);
		// 4. Handle the request
		expect(itr.next(fn as any).value).toEqual(
			effects.spawn(fetch, event.data.req, fn)
		);
	});
});

describe('fetch', () => {
	const req = createRequest({
		type: 'query',
		query: 'test',
	});

	test('should catch errors', () => {
		const error = new Error('runtime error');
		const fn = jest.fn();

		const itr = fetch(req, fn);
		itr.next();

		const event = {
			type: '@failed',
			data: {
				req: {
					id: req.id,
					type: req.type,
				},
				error,
			},
		};

		expect(itr.throw(error).value).toEqual(effects.put(event));
	});

	test('should emit data on success', () => {
		const fn = jest.fn();
		const users = [{ name: 'A' }, { name: 'B' }];

		const event = {
			type: '@data',
			data: {
				res: {
					data: users,
					done: true,
					request: {
						id: req.id,
						type: req.type,
					},
				},
			},
		};

		const itr = fetch(req, fn);
		expect(itr.next().value).toEqual(effects.call(fn));
		expect(itr.next(users).value).toEqual(effects.put(event));
	});
});
