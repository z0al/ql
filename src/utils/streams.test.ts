// Packages
import * as RxObservable from 'rxjs';
import ZenObservable from 'zen-observable';

// Ours
import {
	from,
	fromPromise,
	fromObservable,
	fromCallback,
	fromGenerator,
} from './streams';
import { observe } from '../test-utils/observe';

const ERROR = new Error('unknown');

describe('fromPromise', () => {
	it('should pass resolved value to .next', async () => {
		const result = { ok: true };
		const p = Promise.resolve(result);
		await observe(fromPromise(p), [result]);
	});

	it('should pass errors to .error', async () => {
		const error = { ok: false };
		const p = Promise.reject(error);
		await observe(fromPromise(p), [], error);
	});
});

describe('fromObservables', () => {
	it('should work with RxJS Observables', async () => {
		const result = [1, 2, 3];
		await observe(fromObservable(RxObservable.from(result)), result);
	});

	it('should work with zen-observable', async () => {
		const result = [1, 2, 3];
		await observe(fromObservable(ZenObservable.from(result)), result);
	});

	it('should catch thrown errors', async () => {
		const rx = new RxObservable.Observable((s) => {
			s.next(1);
			s.error(ERROR);
			s.next(2);
		});

		const zen = new ZenObservable((s) => {
			s.next(1);
			s.error(ERROR);
			s.next(2);
		});

		await observe(fromObservable(rx), [1], ERROR);
		await observe(fromObservable(zen), [1], ERROR);
	});
});

describe('fromCallback', () => {
	it('should convert into a pull stream', () => {
		const fn = jest.fn();
		const stream = fromCallback(fn);

		expect(stream.pull).toEqual(true);
		expect(stream.next).toEqual(expect.any(Function));
	});

	it('should emit values on stream.next()', async () => {
		const fn = jest
			.fn()
			.mockReturnValueOnce(1)
			.mockReturnValueOnce(2)
			.mockReturnValueOnce(3);

		await observe(fromCallback(fn), [1, 2, 3]);
	});

	it('should complete if received undefined or null', async () => {
		const fn = jest
			.fn()
			// 1,2
			.mockReturnValueOnce(1)
			.mockReturnValueOnce(2)
			.mockReturnValueOnce(null)
			// empty
			.mockReturnValueOnce(undefined)
			// 3
			.mockReturnValueOnce(3);

		await observe(fromCallback(fn), [1, 2]);
		await observe(fromCallback(fn), []);
		await observe(fromCallback(fn), [3]);
	});

	it('should catch errors', async () => {
		const fn = jest
			.fn()
			.mockResolvedValueOnce(1)
			.mockRejectedValueOnce(ERROR);

		await observe(fromCallback(fn), [1], ERROR);
	});
});

describe('fromGenerator', () => {
	it('should convert into a pull stream', () => {
		let gen: any = (function*() {})();
		let stream: any = fromGenerator(gen);

		expect(stream.pull).toEqual(true);
		expect(stream.next).toEqual(expect.any(Function));

		gen = (async function*() {})();
		stream = fromGenerator(gen);

		expect(stream.pull).toEqual(true);
		expect(stream.next).toEqual(expect.any(Function));
	});

	it('should emit values on stream.next()', async () => {
		let gen: any = (function*() {
			yield 1;
			yield 2;
			yield 3;
		})();

		await observe(fromGenerator(gen), [1, 2, 3]);

		gen = (async function*() {
			yield 1;
			yield 2;
			yield 3;
		})();

		await observe(fromGenerator(gen), [1, 2, 3]);
	});

	it('should catch errors', async () => {
		let gen: any = (function*() {
			yield 1;
			yield 2;

			throw ERROR;
		})();

		await observe(fromGenerator(gen), [1, 2], ERROR);

		gen = (async function*() {
			yield 1;
			yield 2;

			throw ERROR;
		})();

		await observe(fromGenerator(gen), [1, 2], ERROR);
	});
});

describe('from', () => {
	it('should work with callbacks', async () => {
		const fn: any = jest
			.fn()
			// success
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce(null)
			// failure
			.mockRejectedValueOnce(ERROR);

		await observe(from(fn), [{ ok: true }]);
		await observe(from(fn), [], ERROR);
	});

	it('should work with promises', async () => {
		// success
		let p = Promise.resolve(1);
		await observe(from(p), [1]);

		// failure
		p = Promise.reject(ERROR);
		await observe(from(p), [], ERROR);
	});

	it('should work with observables', async () => {
		// success
		let o: any = ZenObservable.from([1, 2]);
		await observe(from(o), [1, 2]);

		// failure
		o = new RxObservable.Observable((s) => {
			setTimeout(() => {
				s.error(ERROR);
			});
		});

		await observe(from(o), [], ERROR);
	});

	it('should fallback to basic one-time value', async () => {
		// success
		let v: any = { ok: true };
		await observe(from(v), [{ ok: true }]);

		// failure
		// Not applicable
	});
});
