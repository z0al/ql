export type QueryArgs = any;

export interface Object {
  [id: string]: any;
}

export interface Query extends Object {
  id: string | number;
  type?: 'query';
}

export interface DataObject extends Object {
  id: string | number;
  __typename?: string;
}

export interface QueryResult extends Object {
  data?: DataObject[] | DataObject;
  error?: any;
}

export type ResolverOptions = Object;
export type QueryResolver = (
  q: QueryArgs,
  o?: ResolverOptions
) => QueryResult | Promise<QueryResult>;
