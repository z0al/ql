// Packages
import { END } from 'redux-saga';
import { Observable } from 'zen-observable-ts';
import { expectSaga } from 'redux-saga-test-plan';
import { put, take, race, delay } from 'redux-saga/effects';
import { of as RxOf, Observable as RxObservable } from 'rxjs';
import delayP from '@redux-saga/delay-p';

// Ours
import { streamChannel } from './stream';
import { createRequest } from './utils/request';

const req = createRequest({
	type: 'query',
	query: 'test',
});

const saga = function*(s: any, timeout: number = 0) {
	const channel = streamChannel(s, req);
	try {
		while (true) {
			if (timeout > 0) {
				const { event, canceled } = yield race({
					event: take(channel),
					canceled: delay(timeout),
				});

				if (canceled) {
					channel.close();
					break;
				}

				yield put(event);
			} else {
				yield put(yield take(channel));
			}
		}
	} finally {
		// We should get here when we call .emit(END) inside
		// streamChannel
		yield put(END);
	}
};

const dataEvent = (data: any) => ({
	type: '@data',
	payload: { res: { request: req, data } },
});

const errorEvent = (error: any) => ({
	type: '@failed',
	payload: { error, req },
});

test('should consume (async) generators', async () => {
	const gen = function*() {
		yield 1;
		yield 2;
	};

	const asyncGen = async function*() {
		yield await Promise.resolve(1);
		yield 2;
	};

	// Normal generator
	await expectSaga(saga, gen())
		.put(dataEvent(1))
		.put(dataEvent(2))
		.put(END)
		.silentRun();

	// Async generator
	return expectSaga(saga, asyncGen())
		.put(dataEvent(1))
		.put(dataEvent(2))
		.put(END)
		.silentRun();
});

test('should cancel (async) generators on abort', async () => {
	let cancelled = false;
	const gen = async function*() {
		try {
			yield 1;
			yield 2;
			await delayP(150);
			yield 3;
		} finally {
			cancelled = true;
		}
	};

	const g = gen();

	await expectSaga(saga, g, 50)
		.put(dataEvent(1))
		.put(dataEvent(2))
		.not.put(dataEvent(3))
		.put(END)
		.silentRun();

	// We need to wait sometime for `g.return` to resolve
	await delayP(150);
	expect(cancelled).toBe(true);
});

test('should consume observable-like objects', async () => {
	await expectSaga(saga, Observable.of(1, 2))
		.put(dataEvent(1))
		.put(dataEvent(2))
		.put(END)
		.silentRun();

	return expectSaga(saga, RxOf(1, 2))
		.put(dataEvent(1))
		.put(dataEvent(2))
		.put(END)
		.silentRun();
});

test('should cancel observable subscription on abort', async () => {
	let closed = false;

	const sub = (o: any) => {
		o.next(1);
		const timeout = setTimeout(() => o.next(2), 150);

		return () => {
			clearTimeout(timeout);
			closed = true;
		};
	};

	// Zen Observable
	await expectSaga(saga, new Observable(sub), 100)
		.put(dataEvent(1))
		.not.put(dataEvent(2))
		.put(END)
		.silentRun();

	expect(closed).toBe(true);

	// RxJS Observable
	closed = false;
	await expectSaga(saga, new RxObservable(sub), 100)
		.put(dataEvent(1))
		.not.put(dataEvent(2))
		.put(END)
		.silentRun();

	expect(closed).toBe(true);
});

test('should catch errors and return @failed', async () => {
	const error = new Error('FAIL');
	const gen = async function*() {
		yield 1;
		throw error;
	};

	await expectSaga(saga, gen())
		.put(dataEvent(1))
		.put(errorEvent(error))
		.put(END)
		.silentRun()
		.finally(() => {});

	const sub = (o: any) => {
		o.next(1);
		o.error(error);
	};

	const ob = new Observable(sub);
	await expectSaga(saga, ob)
		.put(dataEvent(1))
		.put(errorEvent(error))
		.put(END)
		.silentRun();

	const rx = new Observable(sub);
	return expectSaga(saga, rx)
		.put(dataEvent(1))
		.put(errorEvent(error))
		.put(END)
		.silentRun();
});
