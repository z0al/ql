// Packages
import { renderHook } from '@testing-library/react-hooks';

// Ours
import { useBuildRequest } from './useBuildRequest';

test('should return undefined if query is falsy', () => {
	const { result, rerender } = renderHook((query) =>
		useBuildRequest(query)
	);

	expect(result.current).toEqual(undefined);

	rerender(() => false);
	expect(result.current).toEqual(undefined);
});

test('should preserve object if id has not changed', () => {
	let query: any = {
		query: 'users',
		variables: {
			page: 1,
		},
	};

	const { result, rerender } = renderHook(
		({ query }) => useBuildRequest(query),
		{ initialProps: { query } }
	);

	const resultA = result.current;
	expect(resultA).toEqual({
		id: expect.any(String),
		query: query,
	});

	// changed reference
	query = {
		variables: { page: 1 },
		query: 'users',
	};

	rerender({ query });

	const resultB = result.current;
	expect(resultA).toBe(resultB);

	// changed values
	query = { ...query, changed: true };
	rerender({ query });

	const resultC = result.current;
	expect(resultA).not.toBe(resultC);
});

test('should not fail if error is thrown when resolving query', () => {
	const request: any = null;
	const { result } = renderHook(() =>
		useBuildRequest(() => request.query)
	);

	expect(result.current).toEqual(undefined);
	expect(result.error).toEqual(undefined);
});
