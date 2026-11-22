/* eslint-disable */
// GENERATED FILE - do not edit by hand.
// Source: backend/openapi.json (openapi-typescript, pinned in tools/typegen).
// Regenerate with: cd frontend && npm run types
// tests/generatedTypes.test.ts fails when this file is stale.

export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Is the service ready, and what has it loaded
         * @description Answers 200 once the models are loaded, and 503 while they load. Never cached: the front end polls it.
         */
        get: operations["health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Limits, thresholds, names and capabilities
         * @description Everything the front end would otherwise hard-code: the snapshot, the limitation line, the four features,
         *     the history rule, the two z lines, the default method, the `web` limits and which optional parts are on.
         *     Carries an `ETag`: the front end reads it at start and after each recovery, and a repeat costs a 304.
         */
        get: operations["config_api_config_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The addresses that can be opened, with counts
         * @description Each address with its transaction, scored and flagged counts and whether its history is long enough.
         *     Addresses with enough history come first, busiest first; the short-history ones follow.
         */
        get: operations["list_addresses_api_addresses_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Whether a typed address is supported
         * @description 200 with the normalised address and its summary; 400 with the checker's specific message for a malformed
         *     address; 404 with three addresses that can be opened for a valid address outside the snapshot.
         */
        post: operations["lookup_api_lookup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Per-day counts, totals, range and history status
         * @description Only days with transactions, oldest first. An address with too little history answers 200 with
         *     `history.status: "insufficient"` and no scored transactions, so its transactions can still be listed.
         */
        get: operations["timeline_api_addresses__address__timeline_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A filtered, sorted page of transaction rows
         * @description Filter by one day (`date`) or a range (`from`, `to`), by `status` and `direction` (each may repeat), sort by
         *     `time`, `amount` (the size of the net amount, in or out) or `score` (a leading minus reverses), and page with `page` and `pageSize`.
         *     A filter that matches nothing is a 200 with an empty list.
         */
        get: operations["transactions_api_addresses__address__transactions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Forgets a fetched address
         * @description Removes an address a live lookup fetched, with its cache file and its watchlist entry (S-09). Answers 204; 403 when live
         *     lookup is off; 404 `unsupported` when the address was never fetched (or has expired); 409 for a snapshot address, which
         *     cannot be forgotten, and while a lookup for the address is still running.
         */
        delete: operations["forget_address_api_addresses__address__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transactions/{txid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One transaction: facts, features, reason and every method's verdict
         * @description The transaction's facts, its four features with their usual values and z-scores, what each was compared with,
         *     the template's explanation and every method's score and flag. 404 `unsupported` for an address outside the
         *     snapshot, 404 `not_found` when the transaction is not that address's, and 422 `insufficient_history`, with the
         *     transaction's facts, when too little earlier history lay behind it to score it.
         */
        get: operations["transaction_api_transactions__txid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}/what-if": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A hypothetical transaction's verdict from every model that can score it
         * @description Scores a transaction of `amountBtc` BTC, `direction` in or out, at `time`, against the address's real history
         *     strictly before that time. Nothing is stored. 400 names each field at fault; 404 `unsupported` for an address outside
         *     the snapshot; 422 when too little history lay before the time, with the counts and the first day that can be scored.
         */
        post: operations["what_if_api_addresses__address__what_if_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}/what-if/curve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Scores over a range of amounts, from one feature build
         * @description The same hypothetical transaction at many amounts: `amountsBtc` (up to `curveMaxPoints`), or `minBtc`, `maxBtc` and
         *     `points` spaced on a log scale, or neither, for `curvePoints` amounts from a hundredth to a thousand times the
         *     address's usual amount in that direction. Each method answers one score and one flag per amount; the scores equal
         *     what E8 gives for each amount alone. Errors as E8.
         */
        post: operations["curve_api_addresses__address__what_if_curve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/addresses/{address}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The scored transactions as a CSV or JSON file
         * @description The rows E6 would list for the same filters, all of them, in the order asked for. `format` is `csv` (the default;
         *     UTF-8, a header row, amounts in BTC, text guarded against formulas) or `json`. A flagged row carries the limitation line.
         */
        get: operations["export_api_addresses__address__export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The methods, their thresholds and test results
         * @description For each method: its family, what its score measures, the score it flags at, whether it can score a new
         *     transaction, and Assignment 2's test results (mean recall and recall per planted pattern, each with its 95%
         *     interval, and the flag rate on real transactions). The numbers are read from Assignment 2's evaluation tables.
         */
        get: operations["methods_api_methods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/watchlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The watched addresses with labels and notes
         * @description Each entry with `address`, `label`, `note`, `addedAt`, `updatedAt` and the address's summary as E3 gives it,
         *     the most recently added first.
         */
        get: operations["list_watchlist_api_watchlist_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/watchlist/{address}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Adds an address to the watchlist, or replaces its label and note
         * @description Answers 201 for a new entry and 200 for a replaced one. 400 names each field at fault (label and note have
         *     length limits); 404 `unsupported` for an address that cannot be opened; 409 `conflict` when the list is full.
         */
        put: operations["put_watchlist_api_watchlist__address__put"];
        post?: never;
        /**
         * Removes an address from the watchlist
         * @description Answers 204 with no body, or 404 `not_found` when the address is not on the list.
         */
        delete: operations["delete_watchlist_api_watchlist__address__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/explanations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The Assistant's guarded explanation of a transaction, or the template
         * @description Body: `address` and either `txid` (a snapshot transaction) or `whatIf` (`amountBtc`, `direction`, `time`, as E8).
         *     200 with the explanation to show: the Assistant's answer when it passed every guardrail check, otherwise the template,
         *     with `attempts` naming the checks a rejected answer failed (the rejected text is never sent). Prepared and cached
         *     answers come back at once (`cached`). With the Assistant off or not installed the template comes back and
         *     `skippedWriters` says why. 400 names each field at fault; 404 for an unknown address or transaction; 422 when the
         *     transaction could not be scored; 429 with `Retry-After` while another answer is being written. A first answer takes
         *     about 10 seconds with the model's load; later ones about 3.
         */
        post: operations["explain_api_explanations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/live/lookups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Starts a live lookup of an address outside the snapshot
         * @description Reads the address's most recent confirmed transactions (`maxTx`, 50 to 1,000; default 500) from the public blockchain
         *     service in the background and scores them. Answers 202 with the lookup, whose `links` give E17 and E18, and a `Location`
         *     header; 200 with a `done` lookup when a fetch under `web.live.cacheDays` old is held. 400 names each field at fault; 403
         *     when live lookup is off; 404 `not_found` for an address with no confirmed transactions; 409 while a lookup for this address
         *     runs; 429 with `Retry-After` while another lookup runs or the hour's allowance is spent; 502 and 504 when the public
         *     service answers with an error or not at all. Only the address is sent to it.
         */
        post: operations["start_lookup_api_live_lookups_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/live/lookups/{lookup_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A live lookup's status and progress
         * @description `status` is one of `queued`, `fetching`, `scoring`, `done`, `failed`, `cancelled`; `progress` counts pages and
         *     transactions against `cap`; a failed lookup carries `error` with the same `status`, `message` and `hint` words an error body
         *     has. This is what E18 streams, and what a client polls (every 2 seconds) when the stream fails.
         */
        get: operations["lookup_status_api_live_lookups__lookup_id__get"];
        put?: never;
        post?: never;
        /**
         * Cancels a live lookup
         * @description Answers 204. The fetch ends at the next page and nothing is stored; a lookup that has already finished is left as it is.
         */
        delete: operations["cancel_lookup_api_live_lookups__lookup_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/live/lookups/{lookup_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A live lookup's progress as server-sent events
         * @description The same body as E17 on every event: `status` when the lookup changes state, `progress` after each page fetched,
         *     then `done` or `failed`. A cancelled lookup ends with a `status` event whose `status` is `cancelled`. A client that
         *     connects late is replayed every event so far, so it never misses the end.
         */
        get: operations["lookup_events_api_live_lookups__lookup_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * AddressSummary
         * @description One address in the list, and the summary E4 returns (A1, plus `kind` and `source`).
         */
        AddressSummary: {
            /** Address */
            address: string;
            /** Firstseen */
            firstSeen: string;
            /** Lastseen */
            lastSeen: string;
            /** Txcount */
            txCount: number;
            /** Scoredcount */
            scoredCount: number;
            /** Flaggedcount */
            flaggedCount: number;
            /**
             * History
             * @enum {string}
             */
            history: "sufficient" | "insufficient";
            /**
             * Kind
             * @enum {string}
             */
            kind: "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr" | "segwit";
            /**
             * Source
             * @enum {string}
             */
            source: "snapshot" | "live";
        };
        /**
         * AddressesResponse
         * @description E3: the addresses that can be opened.
         */
        AddressesResponse: {
            snapshot: components["schemas"]["SnapshotInfo"];
            /** Addresses */
            addresses: components["schemas"]["AddressSummary"][];
        };
        /**
         * Capabilities
         * @description Optional parts of the service and whether this server has them on.
         */
        Capabilities: {
            /** Assistant */
            assistant: boolean;
            /** Livelookup */
            liveLookup: boolean;
        };
        /**
         * ChartSettings
         * @description When a chart switches to WebGL.
         */
        ChartSettings: {
            /** Webglminpoints */
            webglMinPoints: number;
        };
        /**
         * ComparisonBasis
         * @description What a group of features was compared with: how many earlier transactions, from when to when (A1).
         */
        ComparisonBasis: {
            /** Features */
            features: ("F1" | "F2" | "F3" | "F4")[];
            /** Label */
            label: string;
            /** Description */
            description: string;
            /** Txcount */
            txCount: number;
            /** Start */
            start: string;
            /** End */
            end: string;
        };
        /**
         * ConfigResponse
         * @description E2: everything the front end would otherwise hard-code.
         * @example {
         *       "capabilities": {
         *         "assistant": false,
         *         "liveLookup": false
         *       },
         *       "defaultMethod": "baseline",
         *       "features": [
         *         {
         *           "description": "How much the address received or sent in this transaction (BTC).",
         *           "id": "F1",
         *           "name": "Size",
         *           "unit": "BTC"
         *         }
         *       ],
         *       "history": {
         *         "minSpanDays": 14,
         *         "minTx": 10
         *       },
         *       "limitationLine": "Worth investigating, not proof of wrongdoing.",
         *       "snapshot": {
         *         "addressCount": 28,
         *         "dayTimeZone": "UTC",
         *         "illustrative": false,
         *         "method": {
         *           "contributingAbsZ": 2,
         *           "flagAbsZ": 5,
         *           "id": "baseline",
         *           "name": "Baseline",
         *           "note": "Flags mean unusual for this address's own history, nothing more."
         *         },
         *         "snapshotDate": "2026-10-22",
         *         "source": "Blockstream Esplora",
         *         "sourceUrl": "https://blockstream.info/api"
         *       },
         *       "thresholds": {
         *         "contributingAbsZ": 2,
         *         "flagAbsZ": 5
         *       },
         *       "web": {
         *         "...": "the other blocks of settings.json -> web",
         *         "lists": {
         *           "maxPageSize": 200,
         *           "pageSize": 50
         *         },
         *         "whatIf": {
         *           "curveMaxPoints": 61,
         *           "curvePoints": 41,
         *           "debounceMs": 250,
         *           "maxAmountBtc": 21000000,
         *           "maxGapYears": 5,
         *           "minAmountBtc": 1e-8
         *         }
         *       },
         *       "whatIf": {
         *         "defaultTime": "2026-10-22T12:00:00Z"
         *       }
         *     }
         */
        ConfigResponse: {
            snapshot: components["schemas"]["SnapshotInfo"];
            /** Limitationline */
            limitationLine: string;
            /** Features */
            features: components["schemas"]["FeatureInfo"][];
            history: components["schemas"]["HistoryRequirement"];
            thresholds: components["schemas"]["Thresholds"];
            /**
             * Defaultmethod
             * @enum {string}
             */
            defaultMethod: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            web: components["schemas"]["WebSettings"];
            whatIf: components["schemas"]["WhatIfDefaults"];
            capabilities: components["schemas"]["Capabilities"];
        };
        /**
         * CurveMethod
         * @description One method's scores and flags, one per amount.
         */
        CurveMethod: {
            /**
             * Id
             * @enum {string}
             */
            id: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Name */
            name: string;
            /** Threshold */
            threshold: number;
            /** Scores */
            scores: (number | null)[];
            /** Flags */
            flags: boolean[];
        };
        /**
         * CurveRequest
         * @description E9's body: either a list of amounts, or a range with a point count, or neither (the server chooses).
         */
        CurveRequest: {
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out";
            /**
             * Time
             * Format: date-time
             */
            time: string;
            /** Amountsbtc */
            amountsBtc?: (number | string)[] | null;
            /** Minbtc */
            minBtc?: (number | string) | null;
            /** Maxbtc */
            maxBtc?: (number | string) | null;
            /** Points */
            points?: number | null;
        };
        /**
         * CurveResponse
         * @description E9: scores over a range of amounts.
         */
        CurveResponse: {
            /** Address */
            address: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out";
            /** Time */
            time: string;
            /**
             * Usualbtc
             * @description The address's usual amount in that direction.
             */
            usualBtc: number | null;
            /**
             * Decidingmethod
             * @enum {string}
             */
            decidingMethod: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Amountsbtc */
            amountsBtc: number[];
            /** Methods */
            methods: components["schemas"]["CurveMethod"][];
            /** Notavailable */
            notAvailable: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method")[];
        };
        /**
         * ErrorBody
         * @description Every failure answers with this body.
         * @example {
         *       "fields": [
         *         {
         *           "message": "Checksum does not match.",
         *           "name": "address"
         *         }
         *       ],
         *       "hint": "Check the value and try again.",
         *       "message": "Check the address for a typo.",
         *       "requestId": "0f3c9a1e7b2d",
         *       "status": "invalid"
         *     }
         */
        ErrorBody: {
            /**
             * Status
             * @enum {string}
             */
            status: "invalid" | "disabled" | "unsupported" | "not_found" | "conflict" | "too_large" | "insufficient_history" | "rate_limited" | "server_error" | "upstream_error" | "unavailable" | "upstream_timeout";
            /** Message */
            message: string;
            /** Hint */
            hint?: string | null;
            /** Fields */
            fields?: components["schemas"]["FieldError"][] | null;
            /**
             * Requestid
             * @description Matches the server's log line for this request.
             */
            requestId: string;
            /**
             * Examples
             * @description With `unsupported`: three addresses that can be opened.
             */
            examples?: string[] | null;
            /**
             * Canlookuplive
             * @description With `unsupported`: whether a live lookup is on.
             */
            canLookupLive?: boolean | null;
            /** @description With `insufficient_history` on a transaction. */
            transaction?: components["schemas"]["TransactionCore"] | null;
            history?: components["schemas"]["HistoryShortfall"] | null;
            /**
             * Firstscoreddate
             * @description The first day that can be scored, or null.
             */
            firstScoredDate?: string | null;
        };
        /**
         * Evaluation
         * @description How a method did on Assignment 2's tests.
         */
        Evaluation: {
            meanRecall: components["schemas"]["Interval"];
            recallByPattern: components["schemas"]["RecallByPattern"];
            /** Flagrate */
            flagRate: number;
        };
        /**
         * ExplanationRequest
         * @description E12's body: an address, and either one of its snapshot transactions or a what-if transaction as E8 takes it.
         */
        ExplanationRequest: {
            /** Address */
            address: string;
            /**
             * Txid
             * @description A snapshot transaction of the address.
             */
            txid?: string | null;
            /** @description A hypothetical transaction, as E8's body. */
            whatIf?: components["schemas"]["WhatIfRequest"] | null;
        };
        /**
         * ExplanationResponse
         * @description E12: the explanation to show, and how it came about.
         * @example {
         *       "attempts": [
         *         {
         *           "failedChecks": [],
         *           "source": "text150m"
         *         }
         *       ],
         *       "cached": false,
         *       "explanation": "- Larger amount than usual: 0.05000000 BTC (usual 0.00063694 BTC)\nWorth investigating, not proof of wrongdoing.",
         *       "flagged": true,
         *       "limitation": "Worth investigating, not proof of wrongdoing.",
         *       "seconds": 2.6,
         *       "skippedWriters": {},
         *       "source": "text150m",
         *       "txid": "61aced15690314e5ca7056fb742fb004f233a6c006e5fe0622d092b492396a8c"
         *     }
         */
        ExplanationResponse: {
            /**
             * Txid
             * @description The transaction ID, or "what-if" for a hypothetical transaction.
             */
            txid: string;
            /** Flagged */
            flagged: boolean;
            /**
             * Explanation
             * @description The Assistant's answer when it passed every guardrail check; otherwise the template.
             */
            explanation: string;
            /**
             * Source
             * @enum {string}
             */
            source: "text150m" | "template";
            /**
             * Cached
             * @description True when the answer came from memory or from the prepared answers, not from a fresh writing.
             */
            cached: boolean;
            /**
             * Attempts
             * @description Each writer tried and the guardrail checks it failed; empty when none wrote.
             */
            attempts: components["schemas"]["WriterAttempt"][];
            /**
             * Skippedwriters
             * @description A writer this computer cannot run, and why. The template is shown instead.
             */
            skippedWriters: {
                [key: string]: string;
            };
            /** Limitation */
            limitation: string;
            /** Seconds */
            seconds: number;
        };
        /**
         * ExportDocument
         * @description E10 with `format=json`: the rows that match, with the limitation line stated once for the whole file.
         */
        ExportDocument: {
            /** Address */
            address: string;
            /** Snapshotdate */
            snapshotDate: string;
            /**
             * Method
             * @enum {string}
             */
            method: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Limitation */
            limitation: string;
            /** Count */
            count: number;
            /** Transactions */
            transactions: components["schemas"]["ExportRow"][];
        };
        /**
         * ExportFeature
         * @description One of F1 to F4 of an exported transaction, in the units people read (BTC, count, hours, ratio).
         */
        ExportFeature: {
            /**
             * Id
             * @enum {string}
             */
            id: "F1" | "F2" | "F3" | "F4";
            /** Name */
            name: string;
            /** Value */
            value: number | null;
            /** Usual */
            usual: number | null;
            /** Z */
            z: number | null;
        };
        /**
         * ExportRow
         * @description One exported transaction.
         */
        ExportRow: {
            /** Address */
            address: string;
            /** Txid */
            txid: string;
            /**
             * Time
             * @description ISO 8601, UTC.
             */
            time: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out" | "none";
            /** Receivedsats */
            receivedSats: number;
            /** Sentsats */
            sentSats: number;
            /** Netsats */
            netSats: number;
            /** Scored */
            scored: boolean;
            /** Flagged */
            flagged: boolean;
            /**
             * Method
             * @description The deciding method: the one `flagged` and `score` belong to.
             * @enum {string}
             */
            method: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Score */
            score: number | null;
            /**
             * Features
             * @description Empty for a transaction of an address with too little history.
             */
            features: components["schemas"]["ExportFeature"][];
            /** Mainreason */
            mainReason: string | null;
            /**
             * Flaggedby
             * @description Every method that flags it.
             */
            flaggedBy: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method")[];
            /** Sourceurl */
            sourceUrl: string;
            /** Snapshotdate */
            snapshotDate: string;
            /**
             * Limitation
             * @description The limitation line, on a flagged row; null otherwise.
             */
            limitation: string | null;
        };
        /**
         * FeatureDetail
         * @description One of F1 to F4 in the units people read (A1).
         */
        FeatureDetail: {
            /**
             * Id
             * @enum {string}
             */
            id: "F1" | "F2" | "F3" | "F4";
            /** Name */
            name: string;
            /** Description */
            description: string;
            /**
             * Value
             * @description BTC for F1, a count for F2, hours for F3, a ratio for F4.
             */
            value: number | null;
            /**
             * Usual
             * @description Median of the comparison window, in the same units.
             */
            usual: number | null;
            /** Z */
            z: number | null;
            /**
             * Role
             * @enum {string}
             */
            role: "flag" | "contributing" | "within-usual" | "no-comparison";
        };
        /**
         * FeatureInfo
         * @description One of the four features, as the interface names it.
         */
        FeatureInfo: {
            /**
             * Id
             * @enum {string}
             */
            id: "F1" | "F2" | "F3" | "F4";
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Unit */
            unit: string;
        };
        /**
         * FieldError
         * @description One form field at fault.
         */
        FieldError: {
            /** Name */
            name: string;
            /** Message */
            message: string;
        };
        /**
         * HealthResponse
         * @description E1: the service is up and what it has loaded. While the models load the answer is a 503 error body.
         * @example {
         *       "addressCount": 28,
         *       "assistant": "not_installed",
         *       "liveLookup": false,
         *       "methodCount": 9,
         *       "snapshotDate": "2026-10-22",
         *       "status": "ok",
         *       "uptimeSeconds": 12.4,
         *       "version": "0.1.0"
         *     }
         */
        HealthResponse: {
            /**
             * Status
             * @constant
             */
            status: "ok";
            /** Version */
            version: string;
            /** Snapshotdate */
            snapshotDate: string;
            /** Addresscount */
            addressCount: number;
            /** Methodcount */
            methodCount: number;
            /**
             * Assistant
             * @enum {string}
             */
            assistant: "ready" | "not_installed" | "loading" | "off";
            /** Livelookup */
            liveLookup: boolean;
            /** Uptimeseconds */
            uptimeSeconds: number;
        };
        /**
         * HistoryRequirement
         * @description The least history a transaction needs to be scored (A1).
         */
        HistoryRequirement: {
            /** Mintx */
            minTx: number;
            /** Minspandays */
            minSpanDays: number;
        };
        /**
         * HistoryShortfall
         * @description How much earlier history there was against how much scoring needs.
         */
        HistoryShortfall: {
            /** Earliertx */
            earlierTx: number;
            /** Spandays */
            spanDays: number;
            required: components["schemas"]["HistoryRequirement"];
        };
        /**
         * Interval
         * @description A value with its 95% interval.
         */
        Interval: {
            /** Value */
            value: number;
            /** Cilow */
            ciLow: number;
            /** Cihigh */
            ciHigh: number;
        };
        /**
         * ListLimits
         * @description Paging of every list.
         */
        ListLimits: {
            /** Pagesize */
            pageSize: number;
            /** Maxpagesize */
            maxPageSize: number;
        };
        /**
         * LiveInfo
         * @description For a fetched address (S-09): when its history was read, and how much of it is held.
         */
        LiveInfo: {
            /**
             * Fetchedat
             * @description ISO 8601, UTC.
             */
            fetchedAt: string;
            /**
             * Transactions
             * @description How many of the address's most recent confirmed transactions were fetched.
             */
            transactions: number;
            /**
             * Total
             * @description How many confirmed transactions the address has on the chain when the lookup began.
             */
            total: number;
            /**
             * Maxtx
             * @description The cap the lookup was started with.
             */
            maxTx: number;
            /**
             * Truncated
             * @description True when the address has more transactions than were fetched: the oldest fetched ones have little history behind them and are shown unscored.
             */
            truncated: boolean;
        };
        /**
         * LiveLookup
         * @description A lookup's identity, status and progress.
         */
        LiveLookup: {
            /** Id */
            id: string;
            /** Address */
            address: string;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "fetching" | "scoring" | "done" | "failed" | "cancelled";
            progress: components["schemas"]["LookupProgress"];
            /** Maxtx */
            maxTx: number;
            /**
             * Startedat
             * @description ISO 8601, UTC.
             */
            startedAt: string;
            /**
             * Finishedat
             * @description ISO 8601, UTC; null while the lookup runs.
             */
            finishedAt: string | null;
            /** @description Set when `status` is `failed`. */
            error: components["schemas"]["LookupFailure"] | null;
            /**
             * Cached
             * @description True when a fresh fetch of this address was already held and no request left this computer.
             */
            cached: boolean;
            links: components["schemas"]["LookupLinks"];
        };
        /**
         * LiveLookupRequest
         * @description E16's body.
         */
        LiveLookupRequest: {
            /** Address */
            address: string;
            /**
             * Maxtx
             * @description How many of the address's most recent confirmed transactions to fetch: `web.live.minMaxTx` to `web.live.maxTxLimit`; default `web.live.defaultMaxTx`.
             */
            maxTx?: number | null;
        };
        /**
         * LiveSettings
         * @description Limits of a live lookup (S-09).
         */
        LiveSettings: {
            /** Defaultmaxtx */
            defaultMaxTx: number;
            /** Minmaxtx */
            minMaxTx: number;
            /** Maxtxlimit */
            maxTxLimit: number;
            /** Lookupsperhour */
            lookupsPerHour: number;
            /** Cachedays */
            cacheDays: number;
        };
        /**
         * LookupFailure
         * @description Why a lookup failed: `status` is for code, `message` and `hint` are words safe to show.
         */
        LookupFailure: {
            /**
             * Status
             * @enum {string}
             */
            status: "invalid" | "disabled" | "unsupported" | "not_found" | "conflict" | "too_large" | "insufficient_history" | "rate_limited" | "server_error" | "upstream_error" | "unavailable" | "upstream_timeout";
            /** Message */
            message: string;
            /** Hint */
            hint?: string | null;
        };
        /**
         * LookupLinks
         * @description Where to follow the lookup.
         */
        LookupLinks: {
            /**
             * Status
             * @description E17.
             */
            status: string;
            /**
             * Events
             * @description E18.
             */
            events: string;
        };
        /**
         * LookupProgress
         * @description How far the fetch has got.
         */
        LookupProgress: {
            /**
             * Pages
             * @description Pages of 25 transactions fetched so far.
             */
            pages: number;
            /**
             * Transactions
             * @description Transactions fetched so far.
             */
            transactions: number;
            /**
             * Cap
             * @description Where the fetch stops: `maxTx`, or the address's own count when that is smaller.
             */
            cap: number;
            /**
             * Total
             * @description The address's confirmed transactions on the chain; null before the service has said.
             */
            total: number | null;
        };
        /**
         * LookupRequest
         * @description E4's body. The checker's specific message for a bad address comes from core.validation.
         */
        LookupRequest: {
            /** Address */
            address: string;
        };
        /**
         * LookupResponse
         * @description E4: the typed address is supported.
         */
        LookupResponse: {
            /**
             * Status
             * @constant
             */
            status: "supported";
            /**
             * Address
             * @description The normalised address.
             */
            address: string;
            summary: components["schemas"]["AddressSummary"];
        };
        /**
         * MethodEntry
         * @description One method: `name` is the short name the screens use, `longName` the one the Models page adds (Mod-21).
         */
        MethodEntry: {
            /**
             * Id
             * @enum {string}
             */
            id: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Name */
            name: string;
            /** Longname */
            longName: string;
            /**
             * Family
             * @enum {string}
             */
            family: "statistics" | "outlier detection" | "clustering" | "regression" | "combination" | "language model";
            /** Description */
            description: string;
            /** Threshold */
            threshold: number;
            /** Scoresnewinput */
            scoresNewInput: boolean;
            evaluation: components["schemas"]["Evaluation"];
        };
        /**
         * MethodInfo
         * @description The deciding method and the two z lines the explanation uses (A1).
         */
        MethodInfo: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Flagabsz */
            flagAbsZ: number;
            /** Contributingabsz */
            contributingAbsZ: number;
            /** Note */
            note: string;
        };
        /**
         * MethodsResponse
         * @description E11: the methods, their thresholds and test results.
         */
        MethodsResponse: {
            /**
             * Defaultmethod
             * @enum {string}
             */
            defaultMethod: "baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method";
            /** Methods */
            methods: components["schemas"]["MethodEntry"][];
        };
        /**
         * Reason
         * @description One reason a transaction stands out, as the screen writes it (Mod-20): Assignment 2's choice and order, the web's words.
         */
        Reason: {
            /**
             * Feature
             * @enum {string}
             */
            feature: "F1" | "F2" | "F3" | "F4";
            /**
             * Label
             * @description What stands out, such as 'Larger amount than usual' or 'Small for a received amount'.
             */
            label: string;
            /**
             * Level
             * @description 'flag' or 'contributing' for a feature at or above a z line; 'largest' when none reaches one and these are the two biggest differences.
             * @enum {string}
             */
            level: "flag" | "contributing" | "largest";
            /**
             * Valuetext
             * @description This transaction's figure with its unit, such as '0.05000000 BTC' or '0.4×'.
             */
            valueText: string;
            /**
             * Usualtext
             * @description The address's usual figure, written the same way.
             */
            usualText: string;
        };
        /**
         * RecallByPattern
         * @description Recall on each planted pattern.
         */
        RecallByPattern: {
            spike: components["schemas"]["Interval"];
            burst: components["schemas"]["Interval"];
            dormant: components["schemas"]["Interval"];
        };
        /**
         * ReplaySettings
         * @description Replay speeds (S-06).
         */
        ReplaySettings: {
            /** Speeds */
            speeds: number[];
        };
        /**
         * RequestLimits
         * @description Limits on what a request may carry.
         */
        RequestLimits: {
            /** Maxbodybytes */
            maxBodyBytes: number;
            /** Maxaddresschars */
            maxAddressChars: number;
        };
        /**
         * RequestSettings
         * @description Time limits and polling the front end applies.
         */
        RequestSettings: {
            /** Timeoutms */
            timeoutMs: number;
            /** Assistanttimeoutms */
            assistantTimeoutMs: number;
            /** Healthpollseconds */
            healthPollSeconds: number;
        };
        /**
         * SnapshotInfo
         * @description What the data is and where it came from (A1).
         */
        SnapshotInfo: {
            /** Snapshotdate */
            snapshotDate: string;
            /** Source */
            source: string;
            /** Sourceurl */
            sourceUrl: string;
            /** Illustrative */
            illustrative: boolean;
            /**
             * Daytimezone
             * @constant
             */
            dayTimeZone: "UTC";
            /** Addresscount */
            addressCount: number;
            method: components["schemas"]["MethodInfo"];
        };
        /**
         * Thresholds
         * @description The two z lines: a feature at or above `flagAbsZ` flags; at or above `contributingAbsZ` contributes.
         */
        Thresholds: {
            /** Flagabsz */
            flagAbsZ: number;
            /** Contributingabsz */
            contributingAbsZ: number;
        };
        /**
         * TimeRange
         * @description The first and last transaction time.
         */
        TimeRange: {
            /** Start */
            start: string;
            /** End */
            end: string;
        };
        /**
         * TimelineDay
         * @description One day that has transactions (A1).
         */
        TimelineDay: {
            /** Date */
            date: string;
            /** Txcount */
            txCount: number;
            /** Flaggedcount */
            flaggedCount: number;
        };
        /**
         * TimelineHistory
         * @description Whether the history is long enough to score, and from when (A1).
         */
        TimelineHistory: {
            /**
             * Status
             * @enum {string}
             */
            status: "sufficient" | "insufficient";
            /** Txcount */
            txCount: number;
            /** Spandays */
            spanDays: number;
            required: components["schemas"]["HistoryRequirement"];
            /** Firstscoreddate */
            firstScoredDate: string | null;
        };
        /**
         * TimelineResponse
         * @description E5: per-day counts, totals, range and history status of one address.
         */
        TimelineResponse: {
            /** Address */
            address: string;
            snapshot: components["schemas"]["SnapshotInfo"];
            range: components["schemas"]["TimeRange"];
            /**
             * Days
             * @description Only days with transactions, oldest first.
             */
            days: components["schemas"]["TimelineDay"][];
            totals: components["schemas"]["TimelineTotals"];
            history: components["schemas"]["TimelineHistory"];
            /** @description Set for a fetched address (`source: "live"`); null for the snapshot's. */
            live?: components["schemas"]["LiveInfo"] | null;
        };
        /**
         * TimelineTotals
         * @description Counts over the whole history (A1).
         */
        TimelineTotals: {
            /** Txcount */
            txCount: number;
            /** Scoredcount */
            scoredCount: number;
            /** Flaggedcount */
            flaggedCount: number;
            /** Flaggeddays */
            flaggedDays: number;
        };
        /**
         * TransactionCore
         * @description A1's `TransactionCore`.
         */
        TransactionCore: {
            /** Address */
            address: string;
            /**
             * Time
             * @description ISO 8601, UTC.
             */
            time: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out" | "none";
            /** Receivedsats */
            receivedSats: number;
            /** Sentsats */
            sentSats: number;
            /** Netsats */
            netSats: number;
            /**
             * Sourceurl
             * @description Public block-explorer page; null for a hypothetical transaction.
             */
            sourceUrl: string | null;
            /** Txid */
            txid: string;
            /** Blockheight */
            blockHeight: number;
        };
        /**
         * TransactionDetail
         * @description E7: one transaction's facts, features, reason and every method's verdict.
         */
        TransactionDetail: {
            /**
             * Scored
             * @constant
             */
            scored: true;
            /** Flagged */
            flagged: boolean;
            /** Score */
            score: number;
            method: components["schemas"]["MethodInfo"];
            /** Features */
            features: components["schemas"]["FeatureDetail"][];
            /** Comparison */
            comparison: components["schemas"]["ComparisonBasis"][];
            /** Limitation */
            limitation: string;
            /**
             * Reasons
             * @description The reasons, strongest first (Assignment 2's `reasons_for`); the flag box is built from this.
             */
            reasons: components["schemas"]["Reason"][];
            /**
             * Explanation
             * @description One line per reason, then the limitation line on a flagged item; the text API clients and exports use.
             */
            explanation: string;
            /**
             * Scores
             * @description Every method's score.
             */
            scores: {
                [key: string]: number | null;
            };
            /**
             * Flags
             * @description Every method's flag.
             */
            flags: {
                [key: string]: boolean;
            };
            /**
             * Ranks
             * @description Per method, the share (0 to 1) of the address's own scored transactions whose score is at or below this one's; null where the method has no score.
             */
            ranks: {
                [key: string]: number | null;
            };
            /** Address */
            address: string;
            /**
             * Time
             * @description ISO 8601, UTC.
             */
            time: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out" | "none";
            /** Receivedsats */
            receivedSats: number;
            /** Sentsats */
            sentSats: number;
            /** Netsats */
            netSats: number;
            /**
             * Sourceurl
             * @description Public block-explorer page; null for a hypothetical transaction.
             */
            sourceUrl: string | null;
            /** Txid */
            txid: string;
            /** Blockheight */
            blockHeight: number;
            /**
             * Source
             * @enum {string}
             */
            source: "snapshot" | "live";
        };
        /**
         * TransactionRow
         * @description One row of E6 (A1's `TransactionRow` plus the deciding method's view).
         */
        TransactionRow: {
            /** Txid */
            txid: string;
            /** Time */
            time: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out" | "none";
            /** Netsats */
            netSats: number;
            /**
             * Status
             * @enum {string}
             */
            status: "flagged" | "not-flagged" | "not-scored";
            /**
             * Score
             * @description The deciding method's score; null when not scored.
             */
            score: number | null;
            /**
             * Mainreason
             * @description The template's strongest reason, such as 'Longer gap than usual'.
             */
            mainReason: string | null;
            /** Mainz */
            mainZ: number | null;
            /**
             * Flaggedby
             * @description How many methods flag it.
             */
            flaggedBy: number;
        };
        /**
         * TransactionsResponse
         * @description E6: a filtered, sorted page of rows.
         */
        TransactionsResponse: {
            /** Address */
            address: string;
            /** Date */
            date: string | null;
            /** Transactions */
            transactions: components["schemas"]["TransactionRow"][];
            /** Page */
            page: number;
            /** Pagesize */
            pageSize: number;
            /** Total */
            total: number;
        };
        /**
         * WatchlistEntry
         * @description One watched address with its label and note, and the address's summary as E3 gives it.
         */
        WatchlistEntry: {
            /** Address */
            address: string;
            /** Label */
            label: string;
            /** Note */
            note: string;
            /**
             * Addedat
             * @description ISO 8601, UTC.
             */
            addedAt: string;
            /**
             * Updatedat
             * @description ISO 8601, UTC; equals `addedAt` until the entry is replaced.
             */
            updatedAt: string;
            summary: components["schemas"]["AddressSummary"];
        };
        /**
         * WatchlistLimits
         * @description Size limits of the watchlist (S-04).
         */
        WatchlistLimits: {
            /** Maxentries */
            maxEntries: number;
            /** Maxlabelchars */
            maxLabelChars: number;
            /** Maxnotechars */
            maxNoteChars: number;
        };
        /**
         * WatchlistPut
         * @description E14's body. The length limits come from settings.json -> web.watchlist and are checked by the watchlist service.
         */
        WatchlistPut: {
            /**
             * Label
             * @description A short name; at most `web.watchlist.maxLabelChars` characters.
             * @default
             */
            label: string;
            /**
             * Note
             * @description A free note; at most `web.watchlist.maxNoteChars` characters.
             * @default
             */
            note: string;
        };
        /**
         * WatchlistResponse
         * @description E13: the entries, most recently added first.
         */
        WatchlistResponse: {
            /** Entries */
            entries: components["schemas"]["WatchlistEntry"][];
        };
        /**
         * WebSettings
         * @description The `web` block of settings.json (plan section 5.7).
         */
        WebSettings: {
            whatIf: components["schemas"]["WhatIfLimits"];
            lists: components["schemas"]["ListLimits"];
            requests: components["schemas"]["RequestSettings"];
            charts: components["schemas"]["ChartSettings"];
            watchlist: components["schemas"]["WatchlistLimits"];
            live: components["schemas"]["LiveSettings"];
            replay: components["schemas"]["ReplaySettings"];
            limits: components["schemas"]["RequestLimits"];
        };
        /**
         * WhatIfDefaults
         * @description Defaults for the what-if form.
         */
        WhatIfDefaults: {
            /**
             * Defaulttime
             * @description Noon UTC on the snapshot date.
             */
            defaultTime: string;
        };
        /**
         * WhatIfLimits
         * @description Ranges of the what-if form (E8, E9).
         */
        WhatIfLimits: {
            /** Minamountbtc */
            minAmountBtc: number;
            /** Maxamountbtc */
            maxAmountBtc: number;
            /** Maxgapyears */
            maxGapYears: number;
            /** Curvepoints */
            curvePoints: number;
            /** Curvemaxpoints */
            curveMaxPoints: number;
            /** Debouncems */
            debounceMs: number;
        };
        /**
         * WhatIfRequest
         * @description E8's body.
         */
        WhatIfRequest: {
            /**
             * Amountbtc
             * @description A number or decimal string, in BTC.
             */
            amountBtc: number | string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out";
            /**
             * Time
             * Format: date-time
             * @description ISO 8601 with a zone, such as 2026-10-20T12:00:00Z.
             */
            time: string;
        };
        /**
         * WhatIfResult
         * @description E8: a transaction detail without an ID or block, from the methods that can score new input.
         */
        WhatIfResult: {
            /**
             * Scored
             * @constant
             */
            scored: true;
            /** Flagged */
            flagged: boolean;
            /** Score */
            score: number;
            method: components["schemas"]["MethodInfo"];
            /** Features */
            features: components["schemas"]["FeatureDetail"][];
            /** Comparison */
            comparison: components["schemas"]["ComparisonBasis"][];
            /** Limitation */
            limitation: string;
            /**
             * Reasons
             * @description The reasons, strongest first (Assignment 2's `reasons_for`); the flag box is built from this.
             */
            reasons: components["schemas"]["Reason"][];
            /**
             * Explanation
             * @description One line per reason, then the limitation line on a flagged item; the text API clients and exports use.
             */
            explanation: string;
            /**
             * Scores
             * @description Every method's score.
             */
            scores: {
                [key: string]: number | null;
            };
            /**
             * Flags
             * @description Every method's flag.
             */
            flags: {
                [key: string]: boolean;
            };
            /**
             * Ranks
             * @description Per method, the share (0 to 1) of the address's own scored transactions whose score is at or below this one's; null where the method has no score.
             */
            ranks: {
                [key: string]: number | null;
            };
            /** Address */
            address: string;
            /**
             * Time
             * @description ISO 8601, UTC.
             */
            time: string;
            /**
             * Direction
             * @enum {string}
             */
            direction: "in" | "out" | "none";
            /** Receivedsats */
            receivedSats: number;
            /** Sentsats */
            sentSats: number;
            /** Netsats */
            netSats: number;
            /**
             * Sourceurl
             * @description Public block-explorer page; null for a hypothetical transaction.
             */
            sourceUrl: string | null;
            /**
             * Txid
             * @constant
             */
            txid: "what-if";
            /**
             * Notavailable
             * @description Methods that cannot score a hypothetical transaction.
             */
            notAvailable: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method")[];
            /** Note */
            note: string;
        };
        /**
         * WriterAttempt
         * @description One writer's try: which writer, and the guardrail checks its answer failed (none when it passed).
         *
         *     The rejected text is never part of a response.
         */
        WriterAttempt: {
            /**
             * Source
             * @enum {string}
             */
            source: "text150m" | "template";
            /** Failedchecks */
            failedChecks: string[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    config_api_config_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigResponse"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    list_addresses_api_addresses_get: {
        parameters: {
            query?: {
                /** @description Whose flags and scores decide (S-01); default: the baseline. */
                method?: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method") | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressesResponse"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    lookup_api_lookup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LookupRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupResponse"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    timeline_api_addresses__address__timeline_get: {
        parameters: {
            query?: {
                /** @description Whose flags and scores decide (S-01); default: the baseline. */
                method?: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method") | null;
            };
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimelineResponse"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    transactions_api_addresses__address__transactions_get: {
        parameters: {
            query?: {
                /** @description One UTC day, YYYY-MM-DD. */
                date?: string | null;
                /** @description First day of an inclusive range; not with `date`. */
                from?: string | null;
                /** @description Last day of an inclusive range. */
                to?: string | null;
                status?: ("flagged" | "not-flagged" | "not-scored")[] | null;
                direction?: ("in" | "out" | "none")[] | null;
                sort?: "time" | "-time" | "amount" | "-amount" | "score" | "-score";
                /** @description Whose flags and scores decide (S-01); default: the baseline. */
                method?: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method") | null;
                page?: number;
                /** @description Defaults to settings web.lists.pageSize. */
                pageSize?: number | null;
            };
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionsResponse"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    forget_address_api_addresses__address__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Live lookup is switched off on this server. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The watchlist is full; a lookup for that address is already running; a snapshot address cannot be forgotten. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    transaction_api_transactions__txid__get: {
        parameters: {
            query: {
                /** @description Whose flag and score decide (S-01); default: the baseline. */
                method?: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method") | null;
                /** @description The address the transaction belongs to. */
                address: string;
            };
            header?: never;
            path: {
                /** @description A transaction ID: 64 hexadecimal characters. */
                txid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionDetail"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Too little earlier history to score. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    what_if_api_addresses__address__what_if_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WhatIfRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WhatIfResult"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Too little earlier history to score. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    curve_api_addresses__address__what_if_curve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CurveRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurveResponse"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Too little earlier history to score. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    export_api_addresses__address__export_get: {
        parameters: {
            query?: {
                /** @description One UTC day, YYYY-MM-DD. */
                date?: string | null;
                /** @description First day of an inclusive range; not with `date`. */
                from?: string | null;
                /** @description Last day of an inclusive range. */
                to?: string | null;
                status?: ("flagged" | "not-flagged" | "not-scored")[] | null;
                direction?: ("in" | "out" | "none")[] | null;
                sort?: "time" | "-time" | "amount" | "-amount" | "score" | "-score";
                /** @description Whose flags and scores decide (S-01); default: the baseline. */
                method?: ("baseline" | "isolation_forest" | "lof" | "kmeans" | "dbscan" | "regression" | "regression_interval" | "fusion" | "txgpt_method") | null;
                format?: "csv" | "json";
            };
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The file. `Content-Disposition: attachment` names it from the first eight characters of the address and the snapshot date. */
            200: {
                headers: {
                    /** @description attachment; filename="1Bbcsfxj-2026-10-22.csv" */
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/csv; charset=utf-8": string;
                    "application/json": components["schemas"]["ExportDocument"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    methods_api_methods_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MethodsResponse"];
                };
            };
            /** @description The copy the client holds is still right (the `ETag` matched). */
            304: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    list_watchlist_api_watchlist_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchlistResponse"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    put_watchlist_api_watchlist__address__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WatchlistPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchlistEntry"];
                };
            };
            /** @description The address was added. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchlistEntry"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The watchlist is full; a lookup for that address is already running; a snapshot address cannot be forgotten. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    delete_watchlist_api_watchlist__address__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A Bitcoin address. */
                address: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    explain_api_explanations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExplanationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExplanationResponse"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Too little earlier history to score. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The Assistant is writing another answer, or too many live lookups; wait `Retry-After` seconds and ask again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    start_lookup_api_live_lookups_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LiveLookupRequest"];
            };
        };
        responses: {
            /** @description A fresh fetch of this address was already held: the lookup is `done` at once. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveLookup"];
                };
            };
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveLookup"];
                };
            };
            /** @description A value is malformed or out of range. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Live lookup is switched off on this server. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The watchlist is full; a lookup for that address is already running; a snapshot address cannot be forgotten. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is over the size limit. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The request body is not JSON. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The Assistant is writing another answer, or too many live lookups; wait `Retry-After` seconds and ask again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The public blockchain service answered with an error. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The public blockchain service did not answer in time. */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    lookup_status_api_live_lookups__lookup_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookup_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveLookup"];
                };
            };
            /** @description Live lookup is switched off on this server. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    cancel_lookup_api_live_lookups__lookup_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookup_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Live lookup is switched off on this server. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    lookup_events_api_live_lookups__lookup_id__events_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookup_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Server-sent events named `status`, `progress`, `done` and `failed`; each carries the body of E17 as its data. A comment line follows every 15 seconds of silence. The stream ends after the last event. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description Live lookup is switched off on this server. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The address, transaction, lookup or path is unknown. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description The service is starting or a file is missing. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
}
