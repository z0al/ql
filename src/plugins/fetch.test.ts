// Packages
import delay from 'delay';

// Ours
import { createFetch } from './fetch';
import { buildRequest } from '../request';
import { pipe } from '../utils/plugins';
import {
	$put,
	$complete,
	$cancel,
	$reject,
	$fetch,
} from '../utils/operations';

// @ts-ignore
global.__DEV__ = true;

const DATA = [
	{ id: 1, name: 'Dan' },
	{ id: 2, name: 'Kent' },
];

const ERROR = new Error('unknown');

const request = buildRequest({ url: '/api/users' });

let emit: any, cache: any, handler: any, fetch: any;

beforeEach(() => {
	emit = jest.fn();
	cache = new Map();
	const api = { emit, cache };

	// actual handler is implemented inside each test
	const fetchHandler = (...args: any[]) => handler(...args);
	fetch = pipe([createFetch(fetchHandler)], api);
});

test('should return a valid plugin', () => {
	const plugin = createFetch(jest.fn());

	expect(plugin.name).toEqual('fetch');
	expect(plugin.init).toEqual(expect.any(Function));
	expect(
		plugin.init({
			emit: jest.fn(),
			cache: new Map(),
		})
	).toEqual(expect.any(Function));
});

test('should call handler on "fetch" operation', () => {
	handler = jest.fn();
	const context = { cache };

	fetch($put(request, null));
	expect(handler).not.toBeCalled();

	fetch($cancel(request));
	expect(handler).not.toBeCalled();

	fetch($complete(request));
	expect(handler).not.toBeCalled();

	fetch($reject(request, null));
	expect(handler).not.toBeCalled();

	fetch($fetch(request));
	expect(handler).toBeCalledWith(request, context);
	expect(handler).toBeCalledTimes(1);
});

test('should not duplicate requests', async () => {
	const context = { cache };
	handler = jest.fn().mockReturnValue(delay(100));

	// ignores when pending
	fetch($fetch(request));
	fetch($fetch(request));
	fetch($fetch(request));
	fetch($fetch(request));
	expect(handler).toBeCalledWith(request, context);
	expect(handler).toBeCalledTimes(1);

	// re-fetches after cancellation
	fetch($cancel(request));
	fetch($fetch(request));
	expect(handler).toBeCalledWith(request, context);
	expect(handler).toBeCalledTimes(2);

	// re-fetches after completion
	await delay(150);
	fetch($fetch(request));
	expect(handler).toBeCalledTimes(3);
});

test('should not emit when cancelled', async () => {
	handler = () => delay(10);

	fetch($fetch(request));
	fetch($cancel(request));
	await delay(15);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($cancel(request));
	expect(emit).toBeCalledTimes(2);
});

test('should work with Promises', async () => {
	handler = jest
		.fn()
		.mockResolvedValueOnce(DATA)
		.mockRejectedValueOnce(ERROR);

	// success
	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($complete(request, DATA));

	// failure
	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($reject(request, ERROR));
});

test('should work with subscriptions', async () => {
	handler = () => (o: any) => {
		const timeout = setTimeout(() => {
			o.next(DATA);
			o.complete();
		});
		return () => clearTimeout(timeout);
	};

	// success
	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($put(request, DATA, { lazy: false }));
	expect(emit).toBeCalledWith($complete(request));
	expect(emit).toBeCalledTimes(3);

	// failure
	handler = () => (o: any) => {
		const timeout = setTimeout(() => o.error(ERROR));
		return () => clearTimeout(timeout);
	};
	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($reject(request, ERROR));
	expect(emit).toBeCalledTimes(5);
});

test('should work with iterators/generators', async () => {
	const meta = { lazy: true };
	let gen: any = (function*() {
		yield DATA[0];
		yield DATA[1];
	})();

	handler = () => gen;

	// success
	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($put(request, DATA[0], meta));

	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($put(request, DATA[1], meta));

	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($complete(request));

	// failure
	gen = (function*() {
		yield DATA;
		throw ERROR;
	})();

	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($put(request, DATA, meta));

	fetch($fetch(request));
	await delay(1);

	expect(emit).toBeCalledWith($fetch(request));
	expect(emit).toBeCalledWith($reject(request, ERROR));
});
