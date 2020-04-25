declare global {
	var __DEV__: boolean;
}

export { Client, createClient } from './client';
export { Request, buildRequest } from './request';
export {
	useQuery,
	useRequest,
	useClient,
	ClientProvider,
} from './react';

export { Result } from './utils/cache';
export { Status } from './utils/status';
export { Plugin, PluginOptions } from './utils/plugins';
