import type { ApiSuccess, paths } from "@homi/types";

import type { ApiClient, RequestOptions } from "./index";

/**
 * Calls typed from the generated OpenAPI paths (WP-10): `path` must be a path of the API that has `method`,
 * `params` fills its `{name}` segments, and the result is the envelope of the 200/201 answer's `data`
 * (`null` for a 204). Request bodies are JSON; a multipart upload goes through `ApiClient` directly.
 *
 *     const typed = createTypedClient(client);
 *     const media = await typed.call("get", "/media/{media}", { params: { media: id } });
 */

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** The paths of the API that have `M`. */
export type PathsWith<M extends HttpMethod> = {
  [P in keyof paths]: [NonNullable<paths[P][M]>] extends [never] ? never : P;
}[keyof paths];

type OperationOf<P extends keyof paths, M extends HttpMethod> = NonNullable<paths[P][M]>;

type PathParams<Op> = Op extends { parameters: { path: infer Params } } ? Params : never;

type QueryParams<Op> = Op extends { parameters: { query?: infer Query } } ? Exclude<Query, undefined> : never;

type JsonBody<Op> = Op extends { requestBody?: { content: { "application/json": infer Body } } } ? Body : never;

type HasRequiredBody<Op> = Op extends { requestBody: { content: { "application/json": unknown } } } ? true : false;

type DataOf<Answer> = Answer extends { content: { "application/json": { data: infer Data } } } ? Data : never;

/** `data` of the 200 answer, else of the 201 answer; `null` when the method answers 204. */
export type SuccessData<Op> = Op extends { responses: infer Responses }
  ? 200 extends keyof Responses
    ? DataOf<Responses[200]>
    : 201 extends keyof Responses
      ? DataOf<Responses[201]>
      : 204 extends keyof Responses
        ? null
        : never
  : never;

export type CallOptions<Op> = ([PathParams<Op>] extends [never] ? { params?: never } : { params: PathParams<Op> }) &
  ([QueryParams<Op>] extends [never] ? { query?: never } : { query?: QueryParams<Op> }) &
  ([JsonBody<Op>] extends [never]
    ? { body?: never }
    : HasRequiredBody<Op> extends true
      ? { body: JsonBody<Op> }
      : { body?: JsonBody<Op> }) & { signal?: AbortSignal };

/** The options are required when the path has parameters or the method a required body. */
type CallArguments<Op> = [PathParams<Op>] extends [never]
  ? HasRequiredBody<Op> extends true
    ? [options: CallOptions<Op>]
    : [options?: CallOptions<Op>]
  : [options: CallOptions<Op>];

export interface TypedClient {
  call<M extends HttpMethod, P extends PathsWith<M>>(
    method: M,
    path: P,
    ...options: CallArguments<OperationOf<P, M>>
  ): Promise<ApiSuccess<SuccessData<OperationOf<P, M>>>>;
}

interface UntypedOptions {
  params?: Record<string, unknown>;
  query?: RequestOptions["query"];
  body?: unknown;
  signal?: AbortSignal;
}

export function createTypedClient(client: ApiClient): TypedClient {
  async function call(method: HttpMethod, path: string, options: UntypedOptions = {}): Promise<ApiSuccess<unknown>> {
    return client.request(fillPath(path, options.params ?? {}), {
      method: method.toUpperCase() as NonNullable<RequestOptions["method"]>,
      query: options.query,
      body: options.body,
      signal: options.signal,
    });
  }

  return { call: call as TypedClient["call"] };
}

function fillPath(path: string, params: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_segment, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter "${name}" for ${path}.`);
    }
    return encodeURIComponent(String(value));
  });
}
