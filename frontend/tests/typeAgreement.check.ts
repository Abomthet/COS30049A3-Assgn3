// Compile-time agreement between the hand-written contract (src/api/types.ts, what every screen uses)
// and the types generated from backend/openapi.json (src/api/generated.ts, the authority).
// There is nothing to run: `npm run typecheck` (and `npm run build`) fail on a disagreement.
//
// Each check is one of:
//   Same<A, B>      the two types are identical;
//   Fits<A, B>      A is assignable to B, a deliberate one-way difference, with the reason beside it
//                   (types.ts is narrower than the schema where the client only ever sends/accepts less,
//                   or wider where the schema is a closed list the client does not need to enforce).
// A failing check shows up as `Type 'false' does not satisfy the constraint 'true'`.
import type { components } from '../src/api/generated';
import type * as T from '../src/api/types';

type S = components['schemas'];

type IsEqual<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type Assert<_T extends true> = never;
/** Identical types. */
type Same<A, B> = IsEqual<A, B>;
/** A can be used wherever B is expected. */
type Fits<A, B> = [A] extends [B] ? true : false;
/** Same fields and types, compared structurally (needed once Omit/intersections are involved). */
type Mutual<A, B> = Fits<A, B> extends true ? Fits<B, A> : false;

// ---------------------------------------------------------------- responses that match exactly
export type Checks = [
  Assert<Same<T.AddressSummary, S['AddressSummary']>>,
  Assert<Same<T.LookupResponse, S['LookupResponse']>>,
  Assert<Same<T.TimelineDay, S['TimelineDay']>>,
  Assert<Same<T.LiveInfo, S['LiveInfo']>>,
  Assert<Same<T.HistoryRequirement, S['HistoryRequirement']>>,
  Assert<Same<T.TransactionRow, S['TransactionRow']>>,
  Assert<Same<T.TransactionsResponse, S['TransactionsResponse']>>,
  Assert<Same<T.TransactionCore, S['TransactionCore']>>,
  Assert<Same<T.FeatureDetail, S['FeatureDetail']>>,
  Assert<Same<T.ComparisonBasis, S['ComparisonBasis']>>,
  Assert<Same<T.CurveMethod, S['CurveMethod']>>,
  Assert<Same<T.Interval, S['Interval']>>,
  Assert<Same<T.WatchlistEntry, S['WatchlistEntry']>>,
  Assert<Same<T.WatchlistResponse, S['WatchlistResponse']>>,
  Assert<Same<T.FieldError, S['FieldError']>>,
  Assert<Same<T.HealthResponse, S['HealthResponse']>>,
  Assert<Same<T.WebSettings, S['WebSettings']>>,
  Assert<Same<T.ExplanationResponse, S['ExplanationResponse']>>,
  Assert<Same<T.WriterAttempt, S['WriterAttempt']>>,
  // Enumerations: the client's unions list exactly the schema's values.
  Assert<Same<T.MethodId, S['CurveMethod']['id']>>,
  Assert<Same<T.MethodId, S['MethodsResponse']['defaultMethod']>>,
  Assert<Same<T.FeatureDetail['id'], S['FeatureInfo']['id']>>,
  Assert<Same<T.Direction, S['TransactionRow']['direction']>>,
  Assert<Same<T.ScoreStatus, S['TransactionRow']['status']>>,
  Assert<Same<T.FeatureRole, S['FeatureDetail']['role']>>,
  Assert<Same<T.LookupStatus, S['LiveLookup']['status']>>,
  Assert<Same<T.AssistantState, S['HealthResponse']['assistant']>>,
  Assert<Same<T.DataSource, S['AddressSummary']['source']>>,
  Assert<Same<T.ExplanationSource, S['ExplanationResponse']['source']>>,
  Assert<Same<T.MethodDescription['family'], string>>,
];

// ---------------------------------------------------------------- documented differences
// 1. MethodInfo.id and FeatureInfo.unit are plain `string` in the schema; the client narrows them to
//    the closed lists the back end uses (MethodId, FeatureUnit). Same shape otherwise.
export type NarrowedStrings = [
  Assert<Same<Omit<T.MethodInfo, 'id'>, Omit<S['MethodInfo'], 'id'>>>,
  Assert<Fits<T.MethodInfo, S['MethodInfo']>>,
  Assert<Same<Omit<T.FeatureInfo, 'unit'>, Omit<S['FeatureInfo'], 'unit'>>>,
  Assert<Fits<T.FeatureInfo, S['FeatureInfo']>>,
  Assert<Mutual<Omit<T.SnapshotInfo, 'method'>, Omit<S['SnapshotInfo'], 'method'>>>,
  Assert<Same<T.SnapshotInfo['method'], T.MethodInfo>>,
  // So AddressesResponse and the other carriers of SnapshotInfo differ only by that narrowing.
  Assert<Fits<T.AddressesResponse, S['AddressesResponse']>>,
  Assert<Mutual<Omit<T.AddressesResponse, 'snapshot'>, Omit<S['AddressesResponse'], 'snapshot'>>>,
  // MethodEntry.family is a closed list in the schema; the client keeps it a plain string (it only
  // displays it). The schema's value fits the client's type, not the other way round.
  Assert<Fits<S['MethodEntry']['family'], T.MethodDescription['family']>>,
  Assert<Same<Omit<T.MethodDescription, 'family'>, Omit<S['MethodEntry'], 'family'>>>,
];

// 2. TimelineResponse.live: the server always sends the key (null for a snapshot address); the schema
//    marks it optional only because the Pydantic field has a default. The client treats it as present.
export type TimelineLive = [
  Assert<Mutual<Omit<T.TimelineResponse, 'live' | 'snapshot'>, Omit<S['TimelineResponse'], 'live' | 'snapshot'>>>,
  Assert<Same<T.TimelineResponse['live'], NonNullable<S['TimelineResponse']['live']> | null>>,
  Assert<Fits<T.TimelineResponse, S['TimelineResponse']>>,
];

// 3. scores / flags / ranks: the schema has an index signature ({[key: string]: ...}); the client
//    types the nine keys. Every other field matches. The client's type fits the schema's, not vice versa.
// (`method` differs only by the MethodInfo.id narrowing of difference 1.)
type DetailMaps = 'scores' | 'flags' | 'ranks' | 'method';
export type DetailShape = [
  Assert<Mutual<Omit<T.TransactionDetail, DetailMaps>, Omit<S['TransactionDetail'], DetailMaps>>>,
  Assert<Fits<T.TransactionDetail, S['TransactionDetail']>>,
  Assert<Same<T.TransactionDetail['scores'], Record<T.MethodId, number | null>>>,
  Assert<Fits<T.TransactionDetail['scores'], S['TransactionDetail']['scores']>>,
  Assert<Fits<T.TransactionDetail['flags'], S['TransactionDetail']['flags']>>,
  Assert<Fits<T.TransactionDetail['ranks'], S['TransactionDetail']['ranks']>>,
];

// 4. WhatIfResult: the schema reuses TransactionDetail's fields minus txid/blockHeight/sourceUrl/source
//    (so it has `direction` etc.) and narrows txid; the client additionally narrows sourceUrl to null and
//    types scores/flags as Partial maps (only methods that can score new input have a key).
type WhatIfOmitted = 'method' | 'txid' | 'sourceUrl' | 'scores' | 'flags' | 'ranks' | 'blockHeight' | 'source';
export type WhatIfShape = [
  Assert<Mutual<Omit<T.WhatIfResult, WhatIfOmitted>, Omit<S['WhatIfResult'], WhatIfOmitted>>>,
  Assert<Same<T.WhatIfResult['txid'], S['WhatIfResult']['txid']>>,
  Assert<Fits<T.WhatIfResult['sourceUrl'], S['WhatIfResult']['sourceUrl']>>,
  Assert<Fits<T.WhatIfResult['scores'], S['WhatIfResult']['scores']>>,
  Assert<Fits<T.WhatIfResult['flags'], S['WhatIfResult']['flags']>>,
  Assert<Fits<T.WhatIfResult['ranks'], S['WhatIfResult']['ranks']>>,
];

// 5. WhatIfCurve is the client's name for CurveResponse.
export type CurveShape = [Assert<Same<T.WhatIfCurve, S['CurveResponse']>>];

// 6. MethodsResponse, ConfigResponse, LiveLookup: same, apart from the narrowed strings above and
//    LiveLookup.error.status (the schema lists the error codes; the client keeps `string`, because it
//    only displays it).
export type Composites = [
  Assert<Same<Omit<T.MethodsResponse, 'methods'>, Omit<S['MethodsResponse'], 'methods'>>>,
  Assert<Same<T.MethodsResponse['methods'], Array<T.MethodDescription>>>,
  Assert<Same<Omit<T.ConfigResponse, 'snapshot' | 'features'>, Omit<S['ConfigResponse'], 'snapshot' | 'features'>>>,
  Assert<Same<T.ConfigResponse['snapshot'], T.SnapshotInfo>>,
  Assert<Same<T.ConfigResponse['features'], T.FeatureInfo[]>>,
  Assert<Same<Omit<T.LiveLookup, 'error'>, Omit<S['LiveLookup'], 'error'>>>,
  Assert<Same<Omit<NonNullable<T.LiveLookup['error']>, 'status'>, Omit<NonNullable<S['LiveLookup']['error']>, 'status'>>>,
  Assert<Fits<NonNullable<S['LiveLookup']['error']>['status'], NonNullable<T.LiveLookup['error']>['status']>>,
];

// ---------------------------------------------------------------- request bodies (client sends)
// A body the client builds must be accepted by the schema. The client sends less than the schema allows:
//  - WhatIfRequest.amountBtc is always a decimal string (the schema also takes a number);
//  - the client's curve body has no `amountsBtc` and takes numbers for minBtc/maxBtc;
//  - WatchlistBody's label/note are optional (the schema has them required in the generated type only
//    because openapi-typescript treats a default as present; the server defaults them to '').
export type Requests = [
  Assert<Fits<T.WhatIfRequest, S['WhatIfRequest']>>,
  Assert<Fits<S['WhatIfRequest'], { amountBtc: string | number; direction: T.WhatIfDirection; time: string }>>,
  Assert<Fits<T.WhatIfCurveRequest, S['CurveRequest']>>,
  Assert<Fits<{ address: string }, S['LookupRequest']>>,
  Assert<Fits<S['LookupRequest'], { address: string }>>,
  Assert<Fits<{ address: string; maxTx?: number }, S['LiveLookupRequest']>>,
  Assert<Fits<T.WatchlistBody, Partial<S['WatchlistPut']>>>,
  Assert<Fits<S['WatchlistPut'], T.WatchlistBody>>,
  // E12: either a txid or a what-if, never both; the schema is the looser pair of optional fields.
  Assert<Fits<T.ExplanationRequest, S['ExplanationRequest']>>,
  Assert<Fits<T.SavedWatchlistEntry['entry'], S['WatchlistEntry']>>,
];

// ---------------------------------------------------------------- error bodies
// The schema has one ErrorBody for every status; the client splits it by status. Each client body fits
// the schema's, except that `requestId` is required there and optional here (a mock or a failure
// detected in the browser has none), and the client-only statuses and `retryAfterSeconds` are extra.
type ServerError = Omit<S['ErrorBody'], 'requestId'> & { requestId?: string };
type ServerBodies = Exclude<T.ApiErrorBody, T.ClientBody>;
export type Errors = [
  Assert<Same<T.ServiceStatusCode | 'invalid' | 'unsupported' | 'not_found' | 'insufficient_history', S['ErrorBody']['status']>>,
  Assert<Same<ServerBodies['status'], S['ErrorBody']['status']>>,
  Assert<Fits<T.InvalidBody, ServerError>>,
  Assert<Fits<T.UnsupportedBody, ServerError>>,
  Assert<Fits<T.InsufficientHistoryBody, ServerError>>,
  Assert<Fits<T.NotFoundBody, ServerError>>,
  Assert<Fits<T.ServiceBody, ServerError>>,
  Assert<Same<T.ErrorExtras['fields'], S['FieldError'][] | undefined>>,
  Assert<Fits<T.InsufficientHistoryBody['history'], NonNullable<S['ErrorBody']['history']>>>,
  Assert<Fits<NonNullable<S['ErrorBody']['history']>, T.InsufficientHistoryBody['history']>>,
];
